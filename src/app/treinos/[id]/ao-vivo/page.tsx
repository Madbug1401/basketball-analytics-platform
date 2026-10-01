import { PracticeLiveGuarded } from "./view";

// Prerender one shell ("_") so the service worker can serve it offline for any id (see public/sw.js).
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <PracticeLiveGuarded />;
}
