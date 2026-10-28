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
  ["/style.css", path.join(root, "style.css")],
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

function renderRecentPosts(posts) {
  const recentPosts = posts.slice(0, 5);
  const items = recentPosts.map((post) => {
    const date = post.date ? `${escapeHtml(post.date)} ` : "";
    const href = `/blog/${encodeURIComponent(post.slug)}/`;
    return `<li>${date}<a href="${escapeHtml(href)}">${escapeHtml(post.title)}</a></li>`;
  });

  if (recentPosts.length < 5) {
    items.push("<li>Cookin' up more posts. Soon (maybe)...</li>");
  }

  return items.join("\n        ");
}

function renderBlogPosts(posts) {
  if (posts.length === 0) {
    return "<p class=\"blog-status\">No posts yet. I'm probably still hypnotized by the blinking cursor.</p>";
  }

  return posts
    .map((post) => {
      const href = `/blog/${encodeURIComponent(post.slug)}/`;
      const date = post.date
        ? `<p class="blog-date">${escapeHtml(post.date)}</p>`
        : "";
      return `<article class="blog-post">
        <h2><a href="${escapeHtml(href)}">${escapeHtml(post.title)}</a></h2>
        ${date}
        <p class="blog-excerpt">${escapeHtml(post.excerpt)}</p>
        <a class="blog-read-more" href="${escapeHtml(href)}">Read post</a>
      </article>`;
    })
    .join("\n");
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

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method not allowed");
    return;
  }

  if (url.pathname === "/blog") {
    response.writeHead(301, { Location: `/blog/${url.search}` });
    response.end();
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      const [template, posts] = await Promise.all([
        readFile(path.join(root, "index.html"), "utf8"),
        getPosts(),
      ]);
      const body = template.replace("__RECENT_POSTS__", renderRecentPosts(posts));
      response.writeHead(200, {
        "Content-Type": mimeTypes[".html"],
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch (error) {
      console.error("Failed to render homepage:", error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load homepage.");
    }
    return;
  }

  if (url.pathname === "/blog/" || url.pathname === "/blog/index.html") {
    if (url.pathname === "/blog/index.html") {
      response.writeHead(301, { Location: `/blog/${url.search}` });
      response.end();
      return;
    }

    try {
      const [template, posts] = await Promise.all([
        readFile(path.join(blogDirectory, "index.html"), "utf8"),
        getPosts(),
      ]);
      const body = template.replace("__BLOG_POSTS__", renderBlogPosts(posts));
      response.writeHead(200, {
        "Content-Type": mimeTypes[".html"],
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch (error) {
      console.error("Failed to render blog index:", error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load blog index.");
    }
    return;
  }

  const postPageMatch = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (postPageMatch) {
    try {
      const slug = decodeURIComponent(postPageMatch[1]);
      if (!url.pathname.endsWith("/")) {
        response.writeHead(301, {
          Location: `/blog/${encodeURIComponent(slug)}/${url.search}`,
        });
        response.end();
        return;
      }

      const post = (await getPosts()).find((entry) => entry.slug === slug);
      if (!post) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Blog post not found.");
        return;
      }
      const template = await readFile(path.join(blogDirectory, "post.html"), "utf8");
      const canonicalUrl = `${canonicalOrigin}/blog/${encodeURIComponent(slug)}/`;
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
