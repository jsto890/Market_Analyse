import { redirect } from "next/navigation";

/** The 0DTE hub became the /options route tree (OPT-07). */
export default function OdteRedirect() {
  redirect("/options");
}
