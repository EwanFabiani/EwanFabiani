async function loadWritingPosts() {
  const postsList = document.querySelector("#writing-posts");

  try {
    const response = await fetch("/api/blogs");
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const posts = await response.json();
    postsList.replaceChildren();

    const recentPosts = posts.slice(0, 5);
    for (const post of recentPosts) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `/blog/${encodeURIComponent(post.slug)}`;
      link.textContent = post.title;

      if (post.date) {
        item.append(document.createTextNode(`${post.date} `));
      }
      item.append(link);
      postsList.append(item);
    }

    if (recentPosts.length < 5) {
      const emptyMessage = document.createElement("li");
      emptyMessage.textContent =
        "Cookin' up more posts. Soon (maybe)...";
      postsList.append(emptyMessage);
    }
  } catch (error) {
    console.error("Could not load writing posts:", error);
    postsList.replaceChildren();
    const errorMessage = document.createElement("li");
    errorMessage.textContent =
      "The writing desk is temporarily offline. Try again after the server wakes up.";
    postsList.append(errorMessage);
  }
}

loadWritingPosts();
