// export const dynamic = "force-dynamic";

// import { NextRequest, NextResponse } from "next/server";
// import prisma from "@/utils/prisma";
// import { getServerSession } from "next-auth";
// import { authOptions } from "@/lib/authOptions";
// import { subDays } from "date-fns";

// export async function GET(request: NextRequest) {
//   try {
//     const session = await getServerSession(authOptions);
//     if (!session?.user?.id) {
//       return NextResponse.json(
//         { error: "Access denied. Seuls les utilisateurs connectés peuvent accéder à leurs appels" },
//         { status: 403 }
//       );
//     }

//     const { searchParams } = request.nextUrl;
//     const intent   = searchParams.get("intent") ?? undefined;
//     const daysAgo  = Number(searchParams.get("daysAgo")) || 7;

//     const calls = await prisma.call.findMany({
//       where: {
//         userId: session.user.id,
//         intent,
//         createdAt: {
//           gte: subDays(new Date(), daysAgo),
//         },
//       },
//       orderBy: { createdAt: "desc" },
//     });

//     return NextResponse.json(calls, { status: 200 });
//   } catch (error) {
//     console.error("Error fetching calls:", error);
//     return NextResponse.json(
//       { error: "Une erreur est survenue." },
//       { status: 500 }
//     );
//   }
// }
