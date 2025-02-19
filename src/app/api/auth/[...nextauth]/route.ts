import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";
// import { AuthOptions } from "next-auth";
// import CredentialsProvider from "next-auth/providers/credentials";
// import { PrismaClient } from "@prisma/client";
// import bcrypt from "bcrypt";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
