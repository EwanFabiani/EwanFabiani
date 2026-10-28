import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const root = path.dirname(fileURLToPath(import.meta.url));
const blogDirectory = path.join(root, "blog");
const canonicalOrigin = "https://ewanfabiani.com";
const staticFiles = new Map([
  ["/", path.join(root, "index.html")],
  ["/index.html", path.join(root, "index.html")],
  ["/style.css", path.join(root, "style.css")],
  ["/script.js", path.join(root, "script.js")],
  ["/blog/", path.join(blogDirectory, "index.html")],
  ["/blog/index.html", path.join(blogDirectory, "index.html")],
  ["/blog/blog.js", path.join(blogDirectory, "blog.js")],
  ["/blog/post.html", path.join(blogDirectory, "post.html")],
]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { markdown, title: undefined, date: undefined };
  }

  const field = (name) =>
    match[1].match(new RegExp(`^${name}:\\s*(.+)\\s*$`, "m"))?.[1]
      ?.replace(/^(["'])(.*)\1$/, "$2");

  return {
    markdown: markdown.slice(match[0].length),
    title: field("title"),
    date: field("date"),
  };
}

async function getPosts() {
  const entries = await readdir(blogDirectory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name);

  const posts = await Promise.all(
    filenames.map(async (filename) => {
      const source = await readFile(path.join(blogDirectory, filename), "utf8");
      const { markdown, title, date } = getFrontmatter(source);
      const heading = markdown.match(/^\s*#\s+(.+)\s*(?:\r?\n|$)/);
      const postTitle = title ?? heading?.[1] ?? filename.slice(0, -3);
      const postMarkdown =
        heading?.[1] === postTitle
          ? markdown.slice(heading[0].length).trimStart()
          : markdown;
      const html = sanitizeHtml(await marked.parse(postMarkdown));
      const excerptText = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
        .replace(/\s+/g, " ")
        .trim();

      return {
        slug: filename.slice(0, -3),
        title: postTitle,
        date: date ?? "",
        excerpt:
          excerptText.length > 200
            ? `${excerptText.slice(0, 197).trimEnd()}...`
            : excerptText,
        html,
      };
    }),
  );

  return posts.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.title.localeCompare(right.title),
  );
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method not allowed");
    return;
  }

  if (url.pathname === "/api/blogs") {
    try {
      const posts = await getPosts();
      sendJson(
        response,
        200,
        posts.map(({ html, ...post }) => post),
      );
    } catch (error) {
      console.error("Failed to load blog posts:", error);
      sendJson(response, 500, { error: "Unable to load blog posts." });
    }
    return;
  }

  const postApiMatch = url.pathname.match(/^\/api\/blogs\/([^/]+)$/);
  if (postApiMatch) {
    try {
      const slug = decodeURIComponent(postApiMatch[1]);
      const post = (await getPosts()).find((entry) => entry.slug === slug);
      if (!post) {
        sendJson(response, 404, { error: "Blog post not found." });
        return;
      }

      sendJson(response, 200, post);
    } catch (error) {
      console.error("Failed to load blog post:", error);
      sendJson(response, 500, { error: "Unable to load blog post." });
    }
    return;
  }

  const postPageMatch = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (postPageMatch && !staticFiles.has(url.pathname)) {
    try {
      const slug = decodeURIComponent(postPageMatch[1]);
      const post = (await getPosts()).find((entry) => entry.slug === slug);
      if (!post) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Blog post not found.");
        return;
      }
      const template = await readFile(staticFiles.get("/blog/post.html"), "utf8");
      const canonicalUrl = `${canonicalOrigin}/blog/${encodeURIComponent(slug)}`;
      const dateMarkup = post.date
        ? `<p class="blog-date">${escapeHtml(post.date)}</p>`
        : "";
      const body = template
        .replaceAll("__CANONICAL_URL__", canonicalUrl)
        .replaceAll("__POST_TITLE__", escapeHtml(post.title))
        .replaceAll("__POST_DESCRIPTION__", escapeHtml(post.excerpt))
        .replace("__POST_DATE__", dateMarkup)
        .replace("__POST_CONTENT__", post.html);
      response.writeHead(200, {
        "Content-Type": mimeTypes[".html"],
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch (error) {
      console.error("Failed to serve blog post:", error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load blog post.");
    }
    return;
  }

  const filePath = staticFiles.get(url.pathname);
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)],
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch (error) {
    console.error(`Failed to serve ${url.pathname}:`, error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to load page.");
  }
});

const port = Number(process.env.PORT ?? 3000);
server.on("error", (error) => {
  console.error("Blog server failed to start:", error);
  process.exitCode = 1;
});
server.listen(port, () => {
  console.log(`Portfolio available at http://localhost:${port}`);
});
