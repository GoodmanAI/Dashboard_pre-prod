import NextAuth from "next-auth";

declare module "next-auth" {
  interface User {
    id: number;
    name: string | null;
    email: string;
    role: "ADMIN" | "CLIENT";
  }

  interface Session {
    user: {
      id: number;
      name: string | null;
      email: string;
      role: "ADMIN" | "CLIENT";
    };
  }

  interface JWT {
    id: number;
    role: "ADMIN" | "CLIENT";
    name: string | null;
    email: string;
  }
}
