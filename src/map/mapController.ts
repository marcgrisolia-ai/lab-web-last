import L from 'leaflet';
import type { Lab } from '../models/types';

export type MapControllerOptions = {
  onLabClick?: (labId: string) => void;
};

export class MapController {
  private map: L.Map | null = null;
  private markers: Map<string, L.Marker> = new Map();
  private labs: Lab[] = [];

  init(labs: Lab[], opts: MapControllerOptions = {}): void {
    this.labs = labs;
    const mapHost = document.getElementById('map');
    if (!mapHost) {
      console.warn('[MapController] #map host not found');
      return;
    }
    this.map = L.map('map', {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 19,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 80,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(this.map);

    labs.forEach((lab) => {
      const icon = L.divIcon({
        className: 'labMarker',
        html: `
          <span class="labMarkerDot" style="--lab-color:${lab.color};"></span>
          <span class="labMarkerLabel">${lab.name.en || lab.id}</span>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const m = L.marker(lab.coords, { icon }).addTo(this.map!);
      if (opts.onLabClick) {
        m.on('click', () => opts.onLabClick?.(lab.id));
      }
      this.markers.set(lab.id, m);
    });

    this.map.scrollWheelZoom.enable();
    this.fitToAllLabs();

    const mapEl = this.map.getContainer();
    mapEl.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
      },
      { passive: false },
    );
  }

  fitToAllLabs(): void {
    if (!this.map) return;
    if (!this.labs.length) {
      this.map.setView([20, 0], 2);
      return;
    }
    const latlngs = this.labs.map((l) => l.coords);
    const bounds = L.latLngBounds(latlngs);
    this.map.fitBounds(bounds.pad(0.25));
  }

  fitToLabs(labIds: string[] | null | undefined): void {
    if (!this.map) return;
    const list = labIds && labIds.length ? labIds : this.labs.map((l) => l.id);
    const latlngs = list
      .map((id) => this.labs.find((l) => l.id === id)?.coords)
      .filter(Boolean) as [number, number][];
    if (!latlngs.length) return this.fitToAllLabs();
    const bounds = L.latLngBounds(latlngs);
    this.map.fitBounds(bounds.pad(0.35), { maxZoom: 12 });
  }

  invalidateSize(): void {
    requestAnimationFrame(() => {
      if (this.map) this.map.invalidateSize(true);
    });
  }
}
