import { LivePage } from "./view";

// Prerender one shell ("_") so the service worker can serve it offline for any id.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <LivePage />;
}
