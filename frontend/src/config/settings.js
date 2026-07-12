import {
  Palette, WifiOff, Lock,
  LayoutGrid, User, Database, MapPin, Scan,
  ArrowUp, ArrowDown, Navigation, ExternalLink,
  Smartphone, Sparkles, Camera, Image, ScanFace, Wrench,
} from "lucide-react";

export const SETTINGS = [
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "Theme style, color mode, and accent color",
  },
  {
    id: "airplane-mode",
    label: "Airplane Mode",
    icon: WifiOff,
    description: "Disable external API calls",
  },
  {
    id: "orientation",
    label: "Screen Orientation",
    icon: Smartphone,
    description: "Lock screen to portrait mode in PWA",
  },
  {
    id: "hidden-files",
    label: "Hidden Files",
    icon: Lock,
    description: "PIN-protected access to hidden files",
  },
  {
    id: "home-columns",
    label: "Home Columns",
    icon: LayoutGrid,
    description: "Number of columns on the home page",
  },
  {
    id: "nickname",
    label: "Default Nickname",
    icon: User,
    description: "Pre-filled nickname on Upload page",
  },
  {
    id: "offline-cache",
    label: "Offline Cache",
    icon: Database,
    description: "Cached data and thumbnails",
  },
  {
    id: "map-zoom",
    label: "Map Zoom Level",
    icon: MapPin,
    description: "Zoom depth when clicking Zoom In on map pins",
  },
  {
    id: "faces-per-page",
    label: "Faces Per Page",
    icon: Scan,
    description: "Media thumbnails per page in face dialog",
  },
  {
    id: "image-editor-tabs",
    label: "Image Editor Tab Order",
    icon: ArrowUp,
    description: "Reorder tabs in the image editor",
  },
  {
    id: "video-editor-tabs",
    label: "Video Editor Tab Order",
    icon: ArrowDown,
    description: "Reorder tabs in the video editor",
  },
  {
    id: "navbar-tab-order",
    label: "Navbar Tab Order",
    icon: Navigation,
    description: "Reorder navigation bar links",
  },
  {
    id: "default-landing",
    label: "Default Landing Tab",
    icon: ExternalLink,
    description: "Page shown when you visit the site",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: ExternalLink,
    description: "Quick links to browser settings",
  },
];

export const SETTINGS_MAP = Object.fromEntries(
  SETTINGS.map((s) => [s.id, s])
);

export const ADMIN_TASKS = [
  {
    id: "admin-ai",
    label: "Generate AI Descriptions",
    icon: Sparkles,
    description: "Generate AI descriptions for all media without one",
    action: "ai",
  },
  {
    id: "admin-exif",
    label: "Generate EXIF Data",
    icon: Camera,
    description: "Extract EXIF / metadata for all media missing it",
    action: "exif",
  },
  {
    id: "admin-thumbnails",
    label: "Generate Thumbnails",
    icon: Image,
    description: "Generate thumbnails for all media missing one",
    action: "thumbnails",
  },
  {
    id: "admin-faces",
    label: "Detect & Save Faces",
    icon: ScanFace,
    description: "Detect and save faces in all unscanned media",
    action: "faces",
  },
  {
    id: "admin-tools",
    label: "Manage Tools",
    icon: Wrench,
    description: "Enable or disable tools in the Tools tab",
    action: "tools",
  },
];

export const ADMIN_TASKS_MAP = Object.fromEntries(
  ADMIN_TASKS.map((t) => [t.id, t])
);
