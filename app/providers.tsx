"use client";

import React from "react";
import { ToastProvider } from "@/app/components/Toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
