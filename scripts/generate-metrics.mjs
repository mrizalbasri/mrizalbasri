import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const username = 'mrizalbasri';
const query = `query($login: String!, $cursor: String) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar { totalContributions }
      totalCommitContributions
      totalPullRequestContributions
    }
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes { primaryLanguage { name color } }
    }
  }
}`;

let cursor;
let contributions;
const languages = new Map();
do {
  const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `login=${username}`];
  if (cursor) args.push('-f', `cursor=${cursor}`);
  const result = JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
  if (result.errors || !result.data?.user) throw new Error('GitHub metrics query failed');
  const user = result.data.user;
  contributions ??= user.contributionsCollection;
  for (const { primaryLanguage } of user.repositories.nodes) {
    if (!primaryLanguage) continue;
    const existing = languages.get(primaryLanguage.name);
    languages.set(primaryLanguage.name, { ...primaryLanguage, count: (existing?.count ?? 0) + 1 });
  }
  cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
} while (cursor);

const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const number = (value) => new Intl.NumberFormat('en-US').format(value);
const topLanguages = [...languages.values()]
  .filter((language) => !['HTML', 'Jupyter Notebook'].includes(language.name))
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  .slice(0, 5);
const go = languages.get('Go');
if (go && !topLanguages.some((language) => language.name === 'Go')) topLanguages.push(go);
const scope = process.env.INCLUDE_PRIVATE === 'true' ? 'public and private repositories' : 'public repositories';
const updated = new Date().toISOString().slice(0, 10);
const stats = [
  [contributions.contributionCalendar.totalContributions, 'Contributions'],
  [contributions.totalCommitContributions, 'Commits'],
  [contributions.totalPullRequestContributions, 'Pull requests'],
];

mkdirSync('assets', { recursive: true });
for (const [theme, background, tile, foreground, muted, border, accent, divider] of [
  ['light', '#f7f7fb', '#ffffff', '#111827', '#5b6380', '#d8d4ea', '#7c3aed', '#e2def2'],
  ['dark', '#0b0c14', '#121322', '#f5f5f9', '#8d93b3', '#2d2647', '#a78bfa', '#231f3a'],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 246" width="760" height="246" role="img" aria-labelledby="title desc">
  <title id="title">GitHub activity and languages for ${username}</title>
  <desc id="desc">Activity over the past year: ${stats.map(([value, label]) => `${number(value)} ${label.toLowerCase()}`).join(', ')}. Selected primary languages found in owned, non-fork repositories accessible to the metrics token, including ${scope}: ${topLanguages.map((language) => `${escape(language.name)}`).join(', ')}. Updated ${updated} UTC.</desc>
  <rect x="0.5" y="0.5" width="759" height="245" rx="14" fill="${background}" stroke="${border}"/>
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" fill="${foreground}">
    <text x="28" y="36" font-size="16" font-weight="700" letter-spacing="0.2">GitHub at a glance</text>
    <text x="732" y="35" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11" fill="${muted}">Updated ${updated} UTC</text>
    <text x="28" y="56" font-size="12" fill="${muted}">Activity over the past year</text>
    ${stats.map(([value, label], index) => {
      const x = 28 + index * 240;
      return `<rect x="${x}" y="72" width="224" height="68" rx="10" fill="${tile}" stroke="${divider}"/>
    <text x="${x + 18}" y="106" font-size="27" font-weight="700" fill="${accent}">${number(value)}</text>
    <text x="${x + 18}" y="126" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11.5" fill="${muted}">${label}</text>`;
    }).join('\n    ')}
    <path d="M28 160H732" stroke="${divider}"/>
    <text x="28" y="185" font-size="12" fill="${muted}">Selected languages · ${scope}, excluding forks</text>
    ${topLanguages.map((language, index) => `<circle cx="${33 + index * 117}" cy="212" r="5" fill="${escape(language.color ?? accent)}"/><text x="${45 + index * 117}" y="216" font-size="12.5" font-weight="500">${escape(language.name)}</text>`).join('\n    ')}
  </g>
</svg>\n`;
  writeFileSync(`assets/github-metrics-${theme}.svg`, svg);
}
console.log('Generated light and dark GitHub metrics cards from live GitHub data.');
