import { redirect } from "next/navigation";

/** Old strikes URL — the ladder now lives under /options (OPT-07). */
export default function OdteStrikesRedirect() {
  redirect("/options/ladder");
}
