export default function RocketIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2.5c2.3 1.7 3.8 4.8 3.8 8.2 0 2.1-.5 4-1.4 5.5h-4.8c-.9-1.5-1.4-3.4-1.4-5.5 0-3.4 1.5-6.5 3.8-8.2Z" />
      <circle cx="12" cy="9.8" r="1.4" />
      <path d="M8.4 13.4c-1.4.5-2.4 1.7-2.7 3.2l2.3-.9" />
      <path d="M15.6 13.4c1.4.5 2.4 1.7 2.7 3.2l-2.3-.9" />
      <path d="M10.3 18.2c.2 1 .9 1.8 1.7 2.3.8-.5 1.5-1.3 1.7-2.3" />
    </svg>
  );
}