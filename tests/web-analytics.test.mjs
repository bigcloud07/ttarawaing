import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("loads privacy-safe web analytics only for Vercel deployments", async () => {
  const [layoutSource, analyticsSource, packageSource] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/web-analytics.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(packageSource, /"@vercel\/analytics"/);
  assert.match(layoutSource, /<WebAnalytics \/>/);
  assert.match(analyticsSource, /@vercel\/analytics\/next/);
  assert.match(
    analyticsSource,
    /window\.location\.hostname\.endsWith\("\.vercel\.app"\)/,
  );
  assert.match(analyticsSource, /return isVercelHost \? \(/);
  assert.match(analyticsSource, /<Analytics beforeSend=\{removeSensitiveUrlParts\} \/>/);
  assert.match(analyticsSource, /url: `\$\{url\.origin\}\$\{url\.pathname\}`/);
  assert.doesNotMatch(
    analyticsSource,
    /searchParams|location\.search|location\.hash/,
  );
});
