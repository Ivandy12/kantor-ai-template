"use client";

import { useEffect } from "react";
import { startTerjemahan } from "@/features/kantor/translate";

/** Bar menu Kantor AI di bawah layar kantor 3D - dinonaktifkan (fitur ada di Paperclip). */
export function KantorDock() {
  useEffect(() => {
    startTerjemahan();
  }, []);

  return null;
}