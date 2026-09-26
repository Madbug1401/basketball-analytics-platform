import { GamePage } from "./view";

// Prerender one shell ("_") so the service worker can serve it offline for any id;
// the view reads the real id from the URL. Other ids still render on demand.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <GamePage />;
}
