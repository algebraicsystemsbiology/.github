// Queries GitHub for all repos tagged with TOPIC and writes a formatted
// list into profile/README.md, between the START/END markers.
// Anything outside those markers is left untouched.

const fs = require("fs");
const path = require("path");

const TOPIC = process.env.TOPIC || "algebraicsystemsbiology";
const TOKEN = process.env.GITHUB_TOKEN;
const README_PATH = path.join(__dirname, "..", "..", "profile", "README.md");

const START_MARKER = "<!-- REPO-LIST:START -->";
const END_MARKER = "<!-- REPO-LIST:END -->";

async function fetchAllTaggedRepos(topic) {
  const perPage = 100;
  let page = 1;
  let all = [];

  // NOTE: the search API excludes forks by default. Group members often tag a
  // fork of an upstream project, so `fork:true` (= "forks *in addition to*
  // sources", not "forks only") is required or those repos silently vanish.
  const query = `topic:${topic} fork:true`;

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "algebraicsystemsbiology-readme-bot",
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  while (true) {
    const url =
      "https://api.github.com/search/repositories" +
      `?q=${encodeURIComponent(query)}` +
      `&sort=updated&order=desc&per_page=${perPage}&page=${page}`;

    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`GitHub search failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    if (page === 1) {
      console.log(`Query: ${query}`);
      console.log(`total_count reported by GitHub: ${data.total_count}`);
    }
    all = all.concat(data.items || []);

    if (!data.items || data.items.length < perPage) break;
    page += 1;
    if (page > 10) break; // sanity cap: 1000 repos is plenty of headroom
  }

  return all;
}

function formatRepoLine(repo) {
  const desc = repo.description ? ` — ${repo.description}` : "";
  const stars = repo.stargazers_count ? ` ⭐ ${repo.stargazers_count}` : "";
  const updated = new Date(repo.pushed_at).toISOString().slice(0, 10);
  return `- **[${repo.full_name}](${repo.html_url})**${desc}${stars} _(updated ${updated})_`;
}

async function main() {
  const repos = await fetchAllTaggedRepos(TOPIC);

  // Sort by most recently pushed
  repos.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

  for (const r of repos) {
    console.log(`  found: ${r.full_name}${r.fork ? " (fork)" : ""}`);
  }

  const lines =
    repos.length > 0
      ? repos.map(formatRepoLine).join("\n")
      : `_No repos tagged \`${TOPIC}\` yet. Add the topic to a repo's "About" section to have it show up here._`;

  const generatedBlock = `${START_MARKER}\n${lines}\n${END_MARKER}`;

  const existing = fs.existsSync(README_PATH)
    ? fs.readFileSync(README_PATH, "utf8")
    : `# Algebraic Systems Biology\n\n${START_MARKER}\n${END_MARKER}\n`;

  const markerRegex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`);

  const updated = markerRegex.test(existing)
    ? existing.replace(markerRegex, generatedBlock)
    : `${existing.trim()}\n\n${generatedBlock}\n`;

  fs.mkdirSync(path.dirname(README_PATH), { recursive: true });
  fs.writeFileSync(README_PATH, updated);

  console.log(`Wrote ${repos.length} repos to ${README_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
