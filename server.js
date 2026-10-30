import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const root = path.dirname(fileURLToPath(import.meta.url));
const blogDirectory = path.join(root, "blog");
const projectsDirectory = path.join(root, "projects");
const canonicalOrigin = "https://ewanfabiani.com";
const siteDescription =
  "Ewan Fabiani's personal website featuring software projects, technical writing, and developer experiences.";
const notFoundMessages = [
  "This page was never ratified by the RFC committee.",
  "Congratulations, you found an undocumented endpoint.",
  "This URL has been deprecated due to lack of funding.",
  "Page not found. Maybe it's still \"coming soon\".",
  "Have you tried turning the internet off and on again?",
  "This endpoint has gone to touch grass.",
];
const featuredProjectFilenames = ["d5-crypto.md"];
const staticFiles = new Map([
  ["/fonts/IBMPlexMono-Italic.woff2", path.join(root, "fonts", "IBMPlexMono-Italic.woff2")],
  ["/fonts/IBMPlexMono-Regular.woff2", path.join(root, "fonts", "IBMPlexMono-Regular.woff2")],
  ["/fonts/IBMPlexMono-SemiBold.woff2", path.join(root, "fonts", "IBMPlexMono-SemiBold.woff2")],
  ["/robots.txt", path.join(root, "robots.txt")],
  ["/style.css", path.join(root, "style.css")],
]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

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

function renderProjects(projects) {
  if (projects.length === 0) {
    return '<p class="blog-status">No projects have been added yet. Check back soon.</p>';
  }

  return projects
    .map(
      (project) => `<article class="blog-post">
        <h2><a href="/projects/${encodeURIComponent(project.slug)}/">${escapeHtml(project.title)}</a></h2>
        <p class="blog-excerpt">${escapeHtml(project.description)}</p>
        <a class="blog-read-more" href="/projects/${encodeURIComponent(project.slug)}/">Read project</a>
      </article>`,
    )
    .join("\n");
}

function renderFeaturedProjects(projects) {
  const featuredProjects = featuredProjectFilenames
    .map((filename) => projects.find((project) => project.filename === filename))
    .filter(Boolean);

  if (featuredProjects.length === 0) {
    return "<li>No featured projects yet.</li>";
  }

  return featuredProjects
    .map(
      (project) => `<li>
          <a href="/projects/${encodeURIComponent(project.slug)}/">${escapeHtml(project.title)}</a>:
          ${escapeHtml(project.description)}
        </li>`,
    )
    .join("\n        ");
}

function renderProjectLinks(links) {
  if (links.length === 0) {
    return "";
  }

  return `<nav class="project-links" aria-label="Project links">
    ${links
      .map(
        (link) =>
          `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)} →</a>`,
      )
      .join("\n    ")}
  </nav>`;
}

function renderSitemap(posts, projects) {
  const urls = [
    { loc: `${canonicalOrigin}/` },
    { loc: `${canonicalOrigin}/blog/` },
    { loc: `${canonicalOrigin}/projects/` },
    ...posts.map((post) => ({
      loc: `${canonicalOrigin}/blog/${encodeURIComponent(post.slug)}/`,
      lastmod: post.date,
    })),
    ...projects.map((project) => ({
      loc: `${canonicalOrigin}/projects/${encodeURIComponent(project.slug)}/`,
    })),
  ];

  const entries = urls
    .map(({ loc, lastmod }) => {
      const lastmodMarkup = lastmod
        ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>`
        : "";
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodMarkup}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

async function serveNotFound(response) {
  try {
    const template = await readFile(path.join(root, "404.html"), "utf8");
    const message =
      notFoundMessages[Math.floor(Math.random() * notFoundMessages.length)];
    const body = template.replace(
      "__NOT_FOUND_MESSAGE__",
      escapeHtml(message),
    );
    response.writeHead(404, {
      "Content-Type": mimeTypes[".html"],
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch (error) {
    console.error("Failed to render 404 page:", error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to load 404 page.");
  }
}

function getFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { markdown, title: undefined, date: undefined, links: [] };
  }

  const field = (name) =>
    match[1].match(new RegExp(`^${name}:\\s*(.+)\\s*$`, "m"))?.[1]
      ?.replace(/^(["'])(.*)\1$/, "$2");
  const links = [];
  const linkPattern =
    /^\s*-\s*label:\s*["']?([^"'\r\n]+)["']?\s*\r?\n\s*url:\s*["']?(https?:\/\/[^"'\s]+)["']?\s*$/gm;
  for (const linkMatch of match[1].matchAll(linkPattern)) {
    links.push({ label: linkMatch[1].trim(), url: linkMatch[2] });
  }

  return {
    markdown: markdown.slice(match[0].length),
    title: field("title"),
    date: field("date"),
    description: field("description"),
    links,
  };
}

async function getProjects() {
  const entries = await readdir(projectsDirectory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name);

  const projects = await Promise.all(
    filenames.map(async (filename) => {
      const source = await readFile(path.join(projectsDirectory, filename), "utf8");
      const { markdown, title, description, date, links } = getFrontmatter(source);
      const heading = markdown.match(/^\s*#\s+(.+)\s*(?:\r?\n|$)/);
      const projectTitle = title ?? heading?.[1] ?? filename.slice(0, -3);
      const content = heading?.[1] === projectTitle
        ? markdown.slice(heading[0].length).trimStart()
        : markdown;
      const html = sanitizeHtml(await marked.parse(content));
      const excerptText = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
        .replace(/\s+/g, " ")
        .trim();

      return {
        filename,
        slug: filename.slice(0, -3),
        title: projectTitle,
        date: date ?? "",
        description:
          description ??
          (excerptText.length > 200
            ? `${excerptText.slice(0, 197).trimEnd()}...`
            : excerptText),
        links,
        html,
      };
    }),
  );

  return projects.sort((left, right) => left.title.localeCompare(right.title));
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

  if (url.pathname === "/sitemap.xml") {
    try {
      const [posts, projects] = await Promise.all([getPosts(), getProjects()]);
      response.writeHead(200, {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(renderSitemap(posts, projects));
    } catch (error) {
      console.error("Failed to render sitemap:", error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load sitemap.");
    }
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      const [template, posts, projects] = await Promise.all([
        readFile(path.join(root, "index.html"), "utf8"),
        getPosts(),
        getProjects(),
      ]);
      const body = template
        .replace("__RECENT_POSTS__", renderRecentPosts(posts))
        .replace("__FEATURED_PROJECTS__", renderFeaturedProjects(projects));
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

  if (url.pathname === "/projects") {
    response.writeHead(301, { Location: `/projects/${url.search}` });
    response.end();
    return;
  }

  if (url.pathname === "/projects/" || url.pathname === "/projects/index.html") {
    if (url.pathname === "/projects/index.html") {
      response.writeHead(301, { Location: `/projects/${url.search}` });
      response.end();
      return;
    }

    try {
      const [template, projects] = await Promise.all([
        readFile(path.join(projectsDirectory, "index.html"), "utf8"),
        getProjects(),
      ]);
      const body = template.replace("__PROJECTS__", renderProjects(projects));
      response.writeHead(200, {
        "Content-Type": mimeTypes[".html"],
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch (error) {
      console.error("Failed to render projects index:", error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load projects index.");
    }
    return;
  }

  const projectPageMatch = url.pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (projectPageMatch) {
    try {
      const slug = decodeURIComponent(projectPageMatch[1]);
      if (!url.pathname.endsWith("/")) {
        response.writeHead(301, {
          Location: `/projects/${encodeURIComponent(slug)}/${url.search}`,
        });
        response.end();
        return;
      }

      const project = (await getProjects()).find((entry) => entry.slug === slug);
      if (!project) {
        await serveNotFound(response);
        return;
      }

      const template = await readFile(path.join(projectsDirectory, "project.html"), "utf8");
      const publishedMeta = project.date
        ? `<meta property="article:published_time" content="${escapeHtml(project.date)}" />`
        : "";
      const body = template
        .replaceAll("__CANONICAL_URL__", `${canonicalOrigin}/projects/${encodeURIComponent(slug)}/`)
        .replaceAll("__SITE_DESCRIPTION__", escapeHtml(siteDescription))
        .replaceAll("__PROJECT_TITLE__", escapeHtml(project.title))
        .replaceAll("__PROJECT_DESCRIPTION__", escapeHtml(project.description))
        .replace("__PROJECT_PUBLISHED_META__", publishedMeta)
        .replace("__PROJECT_LINKS__", renderProjectLinks(project.links))
        .replace("__PROJECT_CONTENT__", project.html);
      response.writeHead(200, {
        "Content-Type": mimeTypes[".html"],
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch (error) {
      console.error("Failed to serve project:", error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load project.");
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
        await serveNotFound(response);
        return;
      }
      const template = await readFile(path.join(blogDirectory, "post.html"), "utf8");
      const canonicalUrl = `${canonicalOrigin}/blog/${encodeURIComponent(slug)}/`;
      const dateMarkup = post.date
        ? `<p class="blog-date">${escapeHtml(post.date)}</p>`
        : "";
      const publishedMeta = post.date
        ? `<meta property="article:published_time" content="${escapeHtml(post.date)}" />`
        : "";
      const body = template
        .replaceAll("__CANONICAL_URL__", canonicalUrl)
        .replaceAll("__POST_TITLE__", escapeHtml(post.title))
        .replaceAll("__POST_DESCRIPTION__", escapeHtml(post.excerpt))
        .replace("__POST_PUBLISHED_META__", publishedMeta)
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
    await serveNotFound(response);
    return;
  }

  try {
    const body = await readFile(filePath);
    const headers = {
      "Content-Type": mimeTypes[path.extname(filePath)],
      "X-Content-Type-Options": "nosniff",
    };
    if (path.extname(filePath) === ".woff2") {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    response.writeHead(200, {
      ...headers,
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
