// Set de íconos minimalistas de línea, mismo estilo que RocketIcon.jsx —
// reemplazan los emojis sueltos que usaba la app antes. Cada uno acepta
// className para tamaño/color vía CSS (heredan font-size y currentColor).
function base(props) {
  return {
    viewBox: '0 0 24 24',
    width: '1em',
    height: '1em',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...props,
  };
}

export function SparklesIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M11 3l1.4 4.2L17 8.6l-4.2 1.4L11 14l-1.4-4.2L5 8.6l4.2-1.4L11 3Z" />
      <path d="M18.5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </svg>
  );
}

export function ClockHistoryIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function CalendarIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 9.5h16M8 3v3M16 3v3" />
    </svg>
  );
}

export function SlidersIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M4 7h9M17 7h3M4 17h2M10 17h10" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="7" cy="17" r="2" />
    </svg>
  );
}

export function CameraIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M4 8.2A1.8 1.8 0 0 1 5.8 6.4H8l1-1.8h6l1 1.8h2.2A1.8 1.8 0 0 1 20 8.2v9A1.8 1.8 0 0 1 18.2 19H5.8A1.8 1.8 0 0 1 4 17.2v-9Z" />
      <circle cx="12" cy="13" r="3.3" />
    </svg>
  );
}

export function PaperclipIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M16.5 7.5 9 15a2.5 2.5 0 0 0 3.5 3.5l7-7a4.5 4.5 0 0 0-6.4-6.4l-7 7a6.5 6.5 0 0 0 9.2 9.2" />
    </svg>
  );
}

export function FolderIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M3.5 7.2c0-.7.6-1.2 1.2-1.2h4.4l2 2h9.2c.6 0 1.2.5 1.2 1.2v8.6c0 .7-.6 1.2-1.2 1.2H4.7c-.6 0-1.2-.5-1.2-1.2V7.2Z" />
    </svg>
  );
}

export function FilmIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M8 5.5v13M16 5.5v13M3 10h5M16 10h5M3 14h5M16 14h5" />
    </svg>
  );
}

export function ChatIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M4.5 5.5h15v10.5H9L4.5 20V5.5Z" />
    </svg>
  );
}

export function TargetIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RefreshIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.9M19.5 12a7.5 7.5 0 0 1-13.2 4.9" />
      <path d="M17.5 3.5v4h-4M6.5 20.5v-4h4" />
    </svg>
  );
}

export function CheckIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M5 13l4.5 4.5L19.5 7" />
    </svg>
  );
}

export function XCircleIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </svg>
  );
}

export function ClipboardIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <rect x="6.5" y="4.5" width="11" height="16" rx="2" />
      <path d="M9 4.5V3.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.7" />
    </svg>
  );
}

export function BulbIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M9 18.5h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.2 11.1c.6.4.9 1 .9 1.7v.2h4.6v-.2c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

export function ClockIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 1.8" />
    </svg>
  );
}

export function BrainIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M9.5 4.5a2.7 2.7 0 0 0-2.7 2.7 2.7 2.7 0 0 0-1.8 4.6 2.7 2.7 0 0 0 1.8 4.6h.9a1.8 1.8 0 0 0 1.8-1.8V6.3a1.8 1.8 0 0 0-1.8-1.8Z" />
      <path d="M14.5 4.5a2.7 2.7 0 0 1 2.7 2.7 2.7 2.7 0 0 1 1.8 4.6 2.7 2.7 0 0 1-1.8 4.6h-.9a1.8 1.8 0 0 1-1.8-1.8V6.3a1.8 1.8 0 0 1 1.8-1.8Z" />
    </svg>
  );
}

export function WarningIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 9.5v4.2M12 16.8h.01" />
    </svg>
  );
}

export function XIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function InboxIcon({ className }) {
  return (
    <svg {...base({ className })}>
      <path d="M4 12.5h4.5l1.2 2.5h4.6l1.2-2.5H20" />
      <path d="M5.5 6h13l1.5 6.5v7a1.3 1.3 0 0 1-1.3 1.3H5.3A1.3 1.3 0 0 1 4 19.5v-7L5.5 6Z" />
    </svg>
  );
}
