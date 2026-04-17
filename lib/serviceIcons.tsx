import type { ReactElement } from "react";
import clsx from "clsx";

export type ServiceIconKey = "water" | "parks" | "default" | string;

export type ServiceIconMeta = {
  element: ReactElement;
  bgClass?: string;
  label?: string;
  colorClass?: string;
};

/** Ícones Font Awesome 6 (solid) + cor por serviço — mapa, pins e menu de camadas. */
export type ServiceFaLayerSpec = {
  iconClass: string;
  color: string;
};

export const SERVICE_FA_LAYER: Record<string, ServiceFaLayerSpec> = {
  VP: { iconClass: "fa-solid fa-tree", color: "#14532d" },
  NH: { iconClass: "fa-solid fa-building-circle-exclamation", color: "#7f1d1d" },
  LM: { iconClass: "fa-solid fa-monument", color: "rgba(43, 141, 176, 1)" },
  PV: { iconClass: "fa-solid fa-dumpster", color: "rgba(207, 199, 235, 1)" },
  MT: { iconClass: "fa-solid fa-road", color: "#ffffff" },
  GO: { iconClass: "fa-solid fa-box-open", color: "rgba(115, 72, 40, 1)" },
  BL: { iconClass: "fa-solid fa-bridge-water", color: "rgba(33, 112, 176, 1)" },
  VJ_VL: { iconClass: "fa-solid fa-broom", color: "#ffffff" },
  VM: { iconClass: "fa-solid fa-broom", color: "#ffffff" },
  CF_VF_LF: { iconClass: "fa-solid fa-store", color: "rgba(176, 62, 19, 1)" },
  CA: { iconClass: "fa-solid fa-tent", color: "rgba(163, 38, 42, 1)" },
  LE: { iconClass: "fa-solid fa-droplet", color: "rgba(33, 112, 176, 1)" },
  ECO: { iconClass: "fa-solid fa-recycle", color: "rgba(22, 101, 52, 1)" },
};

export function getServiceFaLayerSpec(serviceKey: string): ServiceFaLayerSpec | undefined {
  return SERVICE_FA_LAYER[serviceKey];
}

const WaterIcon = (
  <svg
    className="h-5 w-5 text-sky-500"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12.66 2.58a1 1 0 0 0-1.32 0C8.84 4.81 5 9.05 5 13a7 7 0 0 0 14 0c0-3.95-3.84-8.19-6.34-10.42ZM12 20a5 5 0 0 1-5-5c0-2.66 2.53-6.19 5-8.58 2.47 2.39 5 5.92 5 8.58a5 5 0 0 1-5 5Zm2.5-5a2.5 2.5 0 0 1-2.5 2.5 1 1 0 0 1 0-2 0.5 0.5 0 0 0 0-1 2.5 2.5 0 0 1 2.5-2.5 1 1 0 0 1 0 2 0.5 0.5 0 0 0 0 1Z" />
  </svg>
);

const CommunityIcon = (
  <svg
    className="h-5 w-5 text-rose-500"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M11.29 2.3a1 1 0 0 1 1.42 0l8 8A1 1 0 0 1 20 12h-1v8a1 1 0 0 1-1 1h-5v-5h-4v5H4a1 1 0 0 1-1-1v-8h-1a1 1 0 0 1-.71-1.71l8-8Zm-6.59 8.7H5a1 1 0 0 1 1 1v8h3v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5h3v-8a1 1 0 0 1 1-1h.3L12 4.41 4.7 11Z" />
  </svg>
);

const TreeIcon = (
  <svg
    className="h-5 w-5 text-emerald-500"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 2a5 5 0 0 0-5 5c0 1.52.68 2.88 1.75 3.79A4 4 0 0 0 7 14a4 4 0 0 0 3 3.87V21a1 1 0 1 0 2 0v-3.13A4 4 0 0 0 17 14a4 4 0 0 0-1.75-3.21A4.98 4.98 0 0 0 17 7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3c0 1.04-.52 2.03-1.4 2.62a1 1 0 0 0-.32 1.33c.46.74.72 1.51.72 2.05a2 2 0 0 1-4 0c0-.54.26-1.31.72-2.05a1 1 0 0 0-.32-1.33A3.23 3.23 0 0 1 9 7a3 3 0 0 1 3-3Z" />
  </svg>
);

const PinIcon = (
  <svg
    className="h-5 w-5 text-primary"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 2a6 6 0 0 0-6 6c0 4.27 4.73 10 5.19 10.54a1 1 0 0 0 1.62 0C13.27 18 18 12.27 18 8a6 6 0 0 0-6-6Zm0 14.35C10.25 14.07 8 10.74 8 8a4 4 0 0 1 8 0c0 2.74-2.25 6.07-4 8.35ZM12 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
  </svg>
);

const RecycleIcon = (
  <svg
    className="h-5 w-5 text-green-600"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M21.82 15.42l-2.5-4.33a1 1 0 0 0-1.74 1l2.07 3.58H14.5a1 1 0 0 0 0 2h6.32a1 1 0 0 0 1-1.25zM9.73 3.07L7.23 7.4l2.5 4.33a1 1 0 0 0 1.74-1L9.4 7.14l2.5-4.33a1 1 0 0 0-.37-1.37 1 1 0 0 0-1.37.37l-.43.76zM5.93 16.75H3.86l2.5-4.33a1 1 0 0 0-1.74-1l-2.5 4.33A1 1 0 0 0 2.99 17h5.15l-1.54 2.67a1 1 0 0 0 1.74 1l2.5-4.33a1 1 0 0 0-.87-1.5H5.93z" />
  </svg>
);

const WarningIcon = (
  <svg
    className="h-5 w-5 text-amber-500"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 16h2v2h-2v-2zm0-6h2v4h-2v-4z" />
  </svg>
);

export const SERVICE_ICON_REGISTRY: Record<ServiceIconKey, ServiceIconMeta> = {
  water: {
    element: WaterIcon,
    bgClass: "bg-white",
    label: "Lavagem Especial de Equipamentos Públicos",
    colorClass: "text-sky-500",
  },
  community: {
    element: CommunityIcon,
    bgClass: "bg-white",
    label: "Limpeza em áreas de difícil acesso",
    colorClass: "text-rose-500",
  },
  parks: {
    element: TreeIcon,
    bgClass: "bg-white",
    label: "Varrição de Praças",
    colorClass: "text-emerald-500",
  },
  warning: {
    element: WarningIcon,
    bgClass: "bg-amber-50",
    label: "Pontos Viciados",
    colorClass: "text-amber-500",
  },
  ecoponto: {
    element: RecycleIcon,
    bgClass: "bg-green-50",
    label: "Ecopontos",
    colorClass: "text-green-600",
  },
  default: {
    element: PinIcon,
    bgClass: "bg-white",
    label: "Serviço",
    colorClass: "text-primary",
  },
};

export function getServiceIconMeta(key?: string | null): ServiceIconMeta {
  if (!key) {
    return SERVICE_ICON_REGISTRY.default;
  }
  return SERVICE_ICON_REGISTRY[key] ?? SERVICE_ICON_REGISTRY.default;
}

/** Ícone FA para menu/pin quando `serviceKey` está mapeado; senão usa legado (`service_icon`). */
export function ServiceGlyphForMap({
  serviceKey,
  legacyIconKey,
  iconClassName,
}: {
  serviceKey?: string | null;
  legacyIconKey?: string | null;
  iconClassName?: string;
}) {
  const fa = serviceKey ? getServiceFaLayerSpec(serviceKey) : undefined;
  if (fa) {
    return (
      <i
        className={clsx(fa.iconClass, iconClassName ?? "text-[15px] leading-none")}
        style={{ color: fa.color }}
        aria-hidden
      />
    );
  }
  const meta = getServiceIconMeta(legacyIconKey);
  return meta.element;
}
