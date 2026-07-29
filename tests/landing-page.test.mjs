import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderLandingPage() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/about", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the public ttarawaing landing page", async () => {
  const response = await renderLandingPage();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>따라와잉 소개 — 따릉이 대여부터 반납까지 한 번에/);
  assert.match(html, /따릉이로 가는 길/);
  assert.match(html, /더는 따로 찾지 마세요/);
  assert.match(html, /내 따릉이 경로 찾아보기/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="#how"/);
  assert.match(html, /8명 중 8명/);
  assert.match(html, /4\.5 \/ 5/);
  assert.match(html, /실제 대여와 반납까지 완료한 경험과 재방문은/);
  assert.match(html, /서울시·따릉이의 공식 서비스가 아닌 독립/);
  assert.match(html, /href="https:\/\/github\.com\/woowacourse-personal\/2026-lumen-ttarawaing"/);
  assert.doesNotMatch(html, /완벽한 경로|무조건 가장 가까운|실시간 보장/);

  const storyIndex = html.indexOf("만들게 된 계기");
  const problemIndex = html.indexOf("해결하고 싶은 불편");
  assert.ok(storyIndex >= 0, "제작 계기 섹션이 렌더링되어야 합니다.");
  assert.ok(
    storyIndex < problemIndex,
    "제작 계기 섹션이 해결하고 싶은 불편 섹션보다 먼저 나와야 합니다.",
  );
  const pageSource = await readFile(
    new URL("../app/about/page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(
    pageSource.match(/<p className=\{styles\.sectionLabel\}>만들게 된 계기<\/p>/g)
      ?.length,
    1,
    "제작 계기 섹션은 한 번만 나와야 합니다.",
  );
});

test("links the route planner header to the service introduction", async () => {
  const [pageSource, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(
    pageSource,
    /className="service-intro-link"[\s\S]*?href="\/about"[\s\S]*?따라와잉 서비스 소개 보기/,
  );
  assert.match(styles, /\.service-intro-link\s*\{/);
  assert.match(styles, /\.service-intro-link:hover\s*\{/);
});

test("keeps landing page controls touch-friendly and mobile-safe", async () => {
  const styles = await readFile(
    new URL("../app/about/page.module.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.headerCta\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.mobileCta a\s*\{[\s\S]*?min-height:\s*52px/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media \(max-width:\s*760px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
