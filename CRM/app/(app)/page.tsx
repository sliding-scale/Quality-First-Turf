import { redirect } from "next/navigation";

/** Home lives at /home (as in Jobber). The bare address still works and goes there. */
export default function Page() {
  redirect("/home");
}
