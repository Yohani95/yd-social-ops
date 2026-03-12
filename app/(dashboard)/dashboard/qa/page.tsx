import { notFound } from "next/navigation";
import { QAClient } from "./qa-client";

export default function QAPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <QAClient />;
}
