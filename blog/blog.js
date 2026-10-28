const status = document.querySelector("#blog-status");
const postsContainer = document.querySelector("#blog-posts");

function addPost(post) {
  const article = document.createElement("article");
  article.className = "blog-post";
  const heading = document.createElement("h2");
  const link = document.createElement("a");
  link.href = `/blog/${encodeURIComponent(post.slug)}`;
  link.textContent = post.title;
  heading.append(link);
  article.append(heading);

  if (post.date) {
    const date = document.createElement("p");
    date.className = "blog-date";
    date.textContent = post.date;
    article.append(date);
  }

  const excerpt = document.createElement("p");
  excerpt.className = "blog-excerpt";
  excerpt.textContent = post.excerpt;
  article.append(excerpt);

  const readMore = document.createElement("a");
  readMore.className = "blog-read-more";
  readMore.href = link.href;
  readMore.textContent = "Read post";
  article.append(readMore);
  postsContainer.append(article);
}

async function loadPosts() {
  try {
    const response = await fetch("/api/blogs");
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const posts = await response.json();
    posts.forEach(addPost);
    status.textContent = posts.length
      ? ""
      : "No posts yet. I'm probably still hypnotized by the blinking cursor.";
  } catch (error) {
    console.error("Could not load blog posts:", error);
    status.textContent =
      "The writing desk is temporarily offline. Try again after the server wakes up.";
  }
}

loadPosts();
