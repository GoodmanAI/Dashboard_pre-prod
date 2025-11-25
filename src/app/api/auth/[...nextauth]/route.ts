// import NextAuth from "next-auth";
// import { authOptions } from "@/lib/authOptions";
// // import { AuthOptions } from "next-auth";
// // import CredentialsProvider from "next-auth/providers/credentials";
// // import { PrismaClient } from "@prisma/client";
// // import bcrypt from "bcrypt";

// const handler = NextAuth(authOptions);

// export { handler as GET, handler as POST };


import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const handler = NextAuth({
  session: {
    strategy: "jwt",
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",

      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          console.log("❌ Email non trouvé");
          return null;
        }

        // Vérification du mot de passe hashé
        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          console.log("❌ Mot de passe invalide");
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },

    async session({ session, token }: any) {
      if (session.user) {
        session.user.role = token.role;
        session.user.id = token.id;
      }
      return session;
    },
  },

  pages: {
    signIn: "/authentication/signin",
  },
});

export { handler as GET, handler as POST };
