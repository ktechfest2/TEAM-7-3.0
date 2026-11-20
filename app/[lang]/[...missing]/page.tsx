import { notFound } from "next/navigation";

/** Any URL no page matches: show the translated not-found page inside the app's layout. */
export default function Missing() {
  notFound();
}
