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
const updated = new Date().toISOString().slice(0, 10);
const stats = [
  [contributions.contributionCalendar.totalContributions, 'Contributions'],
  [contributions.totalCommitContributions, 'Commits'],
  [contributions.totalPullRequestContributions, 'Pull requests'],
];

mkdirSync('assets', { recursive: true });
for (const [theme, background, foreground, muted, border, accent] of [
  ['light', '#ffffff', '#1f2328', '#59636e', '#d1d9e0', '#0969da'],
  ['dark', '#0d1117', '#f0f6fc', '#9198a1', '#3d444d', '#58a6ff'],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 246" width="760" height="246" role="img" aria-labelledby="title desc">
  <title id="title">GitHub activity and languages for ${username}</title>
  <desc id="desc">Activity over the past year: ${stats.map(([value, label]) => `${number(value)} ${label.toLowerCase()}`).join(', ')}. Selected primary languages found in owned, non-fork repositories accessible to the metrics token, including public and private repositories: ${topLanguages.map((language) => `${escape(language.name)}`).join(', ')}. Updated ${updated} UTC.</desc>
  <rect x="0.5" y="0.5" width="759" height="245" rx="12" fill="${background}" stroke="${border}"/>
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" fill="${foreground}">
    <text x="28" y="35" font-size="17" font-weight="600">GitHub at a glance</text>
    <text x="28" y="58" font-size="12" fill="${muted}">Activity over the past year</text>
    ${stats.map(([value, label], index) => `<text x="${28 + index * 245}" y="102" font-size="28" font-weight="600" fill="${accent}">${number(value)}</text><text x="${28 + index * 245}" y="125" font-size="13" fill="${muted}">${label}</text>`).join('\n    ')}
    <path d="M28 147H732" stroke="${border}"/>
    <text x="28" y="174" font-size="12" fill="${muted}">Selected languages · public + private repos, excluding forks</text>
    ${topLanguages.map((language, index) => `<circle cx="${33 + index * 117}" cy="198" r="5" fill="${escape(language.color ?? accent)}"/><text x="${45 + index * 117}" y="202" font-size="12">${escape(language.name)}</text>`).join('\n    ')}
    <text x="28" y="229" font-size="11" fill="${muted}">Updated ${updated} UTC</text>
  </g>
</svg>\n`;
  writeFileSync(`assets/github-metrics-${theme}.svg`, svg);
}
console.log('Generated light and dark GitHub metrics cards from live GitHub data.');
