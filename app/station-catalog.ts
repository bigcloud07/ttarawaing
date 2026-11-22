import type { Coordinates } from "./route-geometry";

export type Station = {
  id: string;
  name: string;
  address: string;
  coordinates: Coordinates;
  bikes: number | null;
};

type CatalogFile = {
  stations: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }[];
};

let catalogRequest: Promise<Station[]> | null = null;

async function fetchStationCatalog(): Promise<Station[]> {
  const response = await fetch(
    new URL("./data/seoul-bike-stations.json", import.meta.url),
  );
  if (!response.ok) {
    throw new Error(`Station catalog request failed: ${response.status}`);
  }
  const catalog = (await response.json()) as CatalogFile;
  return catalog.stations.map((station) => ({
    id: station.id,
    name: station.name,
    address: station.address,
    coordinates: [station.latitude, station.longitude],
    bikes: null,
  }));
}

export function loadStationCatalog(): Promise<Station[]> {
  if (!catalogRequest) {
    catalogRequest = fetchStationCatalog();
    catalogRequest.catch(() => {
      catalogRequest = null;
    });
  }
  return catalogRequest;
}
