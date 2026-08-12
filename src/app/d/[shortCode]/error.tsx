"use client";

import PatientErrorScreen from "@/components/patient/PatientErrorScreen";

/**
 * Error boundary de la page de depot d'ordonnance.
 * Voir components/patient/PatientErrorScreen.tsx pour le pourquoi.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PatientErrorScreen
      error={error}
      reset={reset}
      action="déposer votre ordonnance"
    />
  );
}
