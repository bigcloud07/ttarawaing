import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("ships the station catalog as a fetched asset, not inside client JavaScript", async () => {
  const catalog = JSON.parse(
    await readFile(
      new URL("../app/data/seoul-bike-stations.json", import.meta.url),
      "utf8",
    ),
  );
  const markers = catalog.stations
    .slice(0, 3)
    .map((station) => `${station.latitude},`);
  const clientRoot = new URL("../dist/client/", import.meta.url);
  const files = await readdir(clientRoot, { recursive: true });

  const scripts = files.filter((file) => file.endsWith(".js"));
  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    const source = await readFile(new URL(script, clientRoot), "utf8");
    for (const marker of markers) {
      assert.equal(source.includes(marker), false, `${script} embeds the station catalog`);
    }
  }

  const catalogAssets = files.filter((file) =>
    /seoul-bike-stations-[\w-]+\.json$/.test(file),
  );
  assert.equal(catalogAssets.length, 1);
});
