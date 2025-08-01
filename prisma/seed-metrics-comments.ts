import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const dataByCentre = [
  {
    email: 'compte_centre1@mail.fr',
    metrics: [
      { month: "Jan", fullMonth: "Janvier", rdv: 30, accueil: 40, examen: 65, secretaire: 75, attente: 80, moyenne: 58 },
        { month: "Fév", fullMonth: "Février", rdv: 25, accueil: 50, examen: 55, secretaire: 72, attente: 78, moyenne: 56 },
        { month: "Mar", fullMonth: "Mars", rdv: 20, accueil: 45, examen: 60, secretaire: 85, attente: 90, moyenne: 60 },
        { month: "Avr", fullMonth: "Avril", rdv: 34, accueil: 38, examen: 69, secretaire: 77, attente: 88, moyenne: 61 },
        { month: "Mai", fullMonth: "Mai", rdv: 28, accueil: 42, examen: 50, secretaire: 80, attente: 76, moyenne: 55 },
        { month: "Juin", fullMonth: "Juin", rdv: 33, accueil: 65, examen: 36, secretaire: 79, attente: 85, moyenne: 60 },
        { month: "Juil", fullMonth: "Juillet", rdv: 22, accueil: 55, examen: 67, secretaire: 72, attente: 89, moyenne: 61 },
        { month: "Aoû", fullMonth: "Août", rdv: 31, accueil: 40, examen: 62, secretaire: 74, attente: 90, moyenne: 59 },
        { month: "Sep", fullMonth: "Septembre", rdv: 29, accueil: 45, examen: 68, secretaire: 75, attente: 80, moyenne: 59 },
        { month: "Oct", fullMonth: "Octobre", rdv: 26, accueil: 43, examen: 69, secretaire: 70, attente: 85, moyenne: 58 },
        { month: "Nov", fullMonth: "Novembre", rdv: 30, accueil: 50, examen: 36, secretaire: 78, attente: 88, moyenne: 56 },
        { month: "Déc", fullMonth: "Décembre", rdv: 34, accueil: 38, examen: 67, secretaire: 73, attente: 81, moyenne: 59 }
    ],
    comments: [
      {
        Jan: [
        {
            comment:
            "Accueil très professionnel, on se sent tout de suite pris en charge. Merci pour votre bienveillance.",
            date: "05/01/2025",
        },
        {
            comment:
            "Rendez-vous pris facilement en ligne, aucune attente sur place. Personnel très agréable.",
            date: "10/01/2025",
        },
        {
            comment:
            "Lieu impersonnel, trop de monde en salle d’attente et peu d’explications données avant l’examen.",
            date: "15/01/2025",
        },
        {
            comment:
            "Très satisfait du service IRM, le personnel m’a mis en confiance dès mon arrivée.",
            date: "22/01/2025",
        },
        ],
        Fév: [
        {
            comment:
            "Excellent accueil dès l'entrée, équipe souriante et rassurante. Je recommande vivement.",
            date: "03/02/2025",
        },
        {
            comment:
            "Tout était clair, rapide et efficace. Merci pour votre gentillesse et votre écoute.",
            date: "09/02/2025",
        },
        {
            comment:
            "On est passé rapidement, mais aucun mot du personnel, tout était fait machinalement. Peu humain.",
            date: "14/02/2025",
        },
        {
            comment:
            "Très bon service, les secrétaires sont efficaces et les locaux très bien tenus. Bravo.",
            date: "21/02/2025",
        },
        ],
        Mar: [
        {
            comment:
            "Médecins empathiques et secrétaires au top. Je suis venue il y a un an en urgence, les secrétaires ont su me guider vers le bon examen et se sont occupées de ma fille pendant mon scanner. Merci !",
            date: "01/03/2025",
        },
        {
            comment:
            "J'ai été pris avec de l'avance. Secrétaire aimable et compréhensive. Très satisfait de mon examen",
            date: "05/03/2025",
        },
        {
            comment:
            "Lieu propre. Parkings spacieux. Radiologue aimable. Mais ne vous attendez pas à être accueilli chaleureusement... Pas trop d'humanité dans ce lieu (d'où une étoile en moins).",
            date: "10/03/2025",
        },
        {
            comment:
            "Les secrétaires sont juste au top que ce soit côté IRM ou côté scanner ! Les professionnels sont souriants et agréables, et certains font preuve d'empathie. Merci à vous.",
            date: "15/03/2025",
        },
        ],
        Avr: [
        {
            comment:
            "Accueil rapide, équipe professionnelle et bien organisée. Tout s’est déroulé dans les temps, je recommande.",
            date: "02/04/2025",
        },
        {
            comment:
            "IRM réalisée sans stress, personnel très pédagogue, on se sent en confiance dès l’entrée. Merci à toute l’équipe.",
            date: "08/04/2025",
        },
        {
            comment:
            "Le service est efficace, mais on a l'impression d'être un numéro. Pas un mot échangé avec le médecin, juste un passage éclair. Dommage.",
            date: "12/04/2025",
        },
        {
            comment:
            "Les explications données avant l'examen étaient claires. L'infirmier a pris le temps de répondre à mes questions. Une vraie écoute.",
            date: "18/04/2025",
        },
        ],
        Mai: [
        {
            comment:
            "Très bonne expérience. Locaux propres, pas d’attente, et personnel très aimable, du début à la fin.",
            date: "03/05/2025",
        },
        {
            comment:
            "Secrétaire très rassurante au téléphone et sur place. Organisation fluide. Merci pour votre humanité.",
            date: "10/05/2025",
        },
        {
            comment:
            "L’attente était longue malgré un rendez-vous pris à l’avance, et personne ne nous informe. Ça manque d’informations sur place.",
            date: "16/05/2025",
        },
        {
            comment:
            "Ponctualité au rendez-vous, équipe disponible et respectueuse. Je me suis sentie écoutée.",
            date: "21/05/2025",
        },
        ],
        Juin: [
        {
            comment:
            "Personnel bienveillant, ambiance calme. J’appréhendais l’examen, mais ils ont su me mettre à l’aise.",
            date: "04/06/2025",
        },
        {
            comment:
            "Très bon accueil, prise en charge rapide et efficace. Les consignes sont claires. Rien à redire.",
            date: "11/06/2025",
        },
        {
            comment:
            "Trop d’automatisation à l’accueil, aucun contact humain avant l’examen. C’est froid et impersonnel.",
            date: "15/06/2025",
        },
        {
            comment:
            "Rien à signaler, tout a été parfait. Une belle équipe, respectueuse et souriante. Merci.",
            date: "24/06/2025",
        },
        ],
        Juil: [
        {
            comment:
            "J'ai été agréablement surprise par la gentillesse du personnel. On se sent pris en charge humainement.",
            date: "02/07/2025",
        },
        {
            comment:
            "Service fluide et bien organisé. L’attente était minime, et tout s’est bien déroulé.",
            date: "09/07/2025",
        },
        {
            comment:
            "Accueil très froid à l’arrivée, peu d’échanges. On ne se sent pas vraiment accompagné.",
            date: "13/07/2025",
        },
        {
            comment:
            "Merci à l’équipe IRM, très professionnelle et attentive. On sent qu’ils prennent leur métier à cœur.",
            date: "25/07/2025",
        },
        ],
        Aoû: [
        {
            comment:
            "Malgré la période estivale, le service est resté rapide et efficace. Bravo à l’équipe présente.",
            date: "01/08/2025",
        },
        {
            comment:
            "Je recommande vivement. Bon accueil, respect des horaires, et personnel compétent.",
            date: "06/08/2025",
        },
        {
            comment:
            "Peu d'indications sur le déroulement de l'examen. On est un peu livré à soi-même.",
            date: "14/08/2025",
        },
        {
            comment:
            "Très bon service, les secrétaires prennent le temps d’expliquer et de rassurer. Merci !",
            date: "20/08/2025",
        },
        ],
        Sep: [
        {
            comment:
            "Rendez-vous obtenu rapidement, très bon accueil. Les locaux sont agréables et modernes.",
            date: "05/09/2025",
        },
        {
            comment:
            "L’ensemble du personnel a été bienveillant. Examen rapide et sans stress.",
            date: "10/09/2025",
        },
        {
            comment:
            "On vous fait passer de salle en salle sans vraiment savoir pourquoi. Manque d'explications.",
            date: "16/09/2025",
        },
        {
            comment:
            "Parfait du début à la fin. Merci pour votre gentillesse et votre efficacité.",
            date: "22/09/2025",
        },
        ],
        Oct: [
        {
            comment:
            "Super accueil, je suis arrivée stressée, et le personnel m’a rassurée dès la première minute.",
            date: "03/10/2025",
        },
        {
            comment:
            "Examen rapide, professionnel très doux. Très bonne expérience.",
            date: "09/10/2025",
        },
        {
            comment:
            "Trop d’attente à l’entrée, et une secrétaire peu aimable. Cela gâche un peu l’expérience.",
            date: "14/10/2025",
        },
        {
            comment:
            "Merci au personnel de radiologie pour leur gentillesse et leur écoute. Vraiment appréciable.",
            date: "21/10/2025",
        },
        ],
        Nov: [
        {
            comment:
            "Excellent accueil et prise en charge. Je me suis sentie accompagnée à chaque étape.",
            date: "02/11/2025",
        },
        {
            comment:
            "Locaux modernes et propres. Personnel souriant et ponctuel. Une expérience rassurante.",
            date: "08/11/2025",
        },
        {
            comment:
            "Trop impersonnel. Aucun contact avec le médecin, juste un compte rendu par mail.",
            date: "15/11/2025",
        },
        {
            comment:
            "Je recommande ce centre sans hésiter. L’équipe est professionnelle et bienveillante.",
            date: "20/11/2025",
        },
        ],
        Déc: [
        {
            comment:
            "Même en période chargée, l’équipe reste disponible et efficace. Merci pour votre sérieux.",
            date: "03/12/2025",
        },
        {
            comment:
            "Accueil chaleureux, les explications étaient claires, et j’ai été rassurée tout au long du parcours.",
            date: "07/12/2025",
        },
        {
            comment:
            "On a l’impression d’un service à la chaîne, peu de contact humain. Décevant.",
            date: "12/12/2025",
        },
        {
            comment:
            "Très bonne gestion des rendez-vous, personnel au top, je suis très satisfaite.",
            date: "18/12/2025",
        },
        ],
    },
    ]
  },
  {
    email: 'compte_centre2@mail.fr',
    metrics: [
        { month: "Jan", fullMonth: "Janvier", rdv: 30, accueil: 60, examen: 75, secretaire: 72, attente: 40, moyenne: 55 },
        { month: "Fév", fullMonth: "Février", rdv: 22, accueil: 65, examen: 70, secretaire: 74, attente: 39, moyenne: 54 },
        { month: "Mar", fullMonth: "Mars", rdv: 28, accueil: 52, examen: 78, secretaire: 73, attente: 41, moyenne: 54 },
        { month: "Avr", fullMonth: "Avril", rdv: 33, accueil: 68, examen: 72, secretaire: 75, attente: 30, moyenne: 56 },
        { month: "Mai", fullMonth: "Mai", rdv: 31, accueil: 58, examen: 74, secretaire: 71, attente: 36, moyenne: 54 },
        { month: "Juin", fullMonth: "Juin", rdv: 24, accueil: 50, examen: 76, secretaire: 70, attente: 42, moyenne: 52 },
        { month: "Juil", fullMonth: "Juillet", rdv: 27, accueil: 60, examen: 71, secretaire: 73, attente: 33, moyenne: 53 },
        { month: "Aoû", fullMonth: "Août", rdv: 29, accueil: 55, examen: 79, secretaire: 70, attente: 34, moyenne: 53 },
        { month: "Sep", fullMonth: "Septembre", rdv: 30, accueil: 62, examen: 75, secretaire: 74, attente: 28, moyenne: 54 },
        { month: "Oct", fullMonth: "Octobre", rdv: 32, accueil: 66, examen: 70, secretaire: 72, attente: 34, moyenne: 55 },
        { month: "Nov", fullMonth: "Novembre", rdv: 26, accueil: 48, examen: 77, secretaire: 76, attente: 31, moyenne: 52 },
        { month: "Déc", fullMonth: "Décembre", rdv: 25, accueil: 59, examen: 73, secretaire: 75, attente: 32, moyenne: 53 }
    ],
    comments: [
        {
        Jan: [
        {
            comment: "Accueil rapide et personnel très aimable. Je recommande vivement ce centre.",
            date: "04/01/2025",
        },
        {
            comment: "Bonne organisation, tout s'est déroulé dans les temps. Merci à toute l'équipe.",
            date: "10/01/2025",
        },
        {
            comment: "Attente interminable malgré un rendez-vous. Aucun mot d'excuse.",
            date: "15/01/2025",
        },
        {
            comment: "Très bon accueil, les explications étaient claires et rassurantes.",
            date: "22/01/2025",
        },
        ],
        Fév: [
        {
            comment: "Tout était fluide, rapide et sans stress. Merci au personnel.",
            date: "02/02/2025",
        },
        {
            comment: "Accueil souriant, prise en charge efficace. On se sent entre de bonnes mains.",
            date: "08/02/2025",
        },
        {
            comment: "Personnel peu accueillant, ambiance froide. On ne se sent pas écouté.",
            date: "13/02/2025",
        },
        {
            comment: "Très satisfait de mon IRM, l’équipe a été professionnelle et rassurante.",
            date: "19/02/2025",
        },
        ],
        Mar: [
        {
            comment: "Médecin très à l’écoute, examen rapide et sans douleur.",
            date: "05/03/2025",
        },
        {
            comment: "Centre propre et bien organisé. Bonne communication.",
            date: "10/03/2025",
        },
        {
            comment: "On se sent traité comme un numéro, pas un mot d'explication.",
            date: "15/03/2025",
        },
        {
            comment: "Merci au personnel pour leur accueil chaleureux et rassurant.",
            date: "22/03/2025",
        },
        ],
        Avr: [
        {
            comment: "Personnel souriant et bienveillant, tout était parfait.",
            date: "04/04/2025",
        },
        {
            comment: "Ponctualité et professionnalisme. L'expérience fut agréable.",
            date: "09/04/2025",
        },
        {
            comment: "Difficulté d’accès au parking, et mauvaise signalisation dans le bâtiment.",
            date: "13/04/2025",
        },
        {
            comment: "Service impeccable, on se sent bien accompagné du début à la fin.",
            date: "20/04/2025",
        },
        ],
        Mai: [
        {
            comment: "Très bon service. Le personnel prend le temps d’expliquer chaque étape.",
            date: "03/05/2025",
        },
        {
            comment: "Locaux bien entretenus et équipe attentive. Je recommande.",
            date: "08/05/2025",
        },
        {
            comment: "Accueil expéditif, on vous fait comprendre qu’il faut vite circuler.",
            date: "13/05/2025",
        },
        {
            comment: "Merci à toute l’équipe, tout s’est passé dans les meilleures conditions.",
            date: "19/05/2025",
        },
        ],
        Juin: [
        {
            comment: "Service rapide, propre et personnel très courtois.",
            date: "02/06/2025",
        },
        {
            comment: "Tout a été parfait, on m’a très bien guidé tout au long de l’examen.",
            date: "07/06/2025",
        },
        {
            comment: "Peu d’explications sur le protocole. J’ai dû poser moi-même toutes les questions.",
            date: "12/06/2025",
        },
        {
            comment: "Merci pour votre humanité et votre professionnalisme.",
            date: "20/06/2025",
        },
        ],
        Juil: [
        {
            comment: "Même en période estivale, tout était fluide. Belle organisation.",
            date: "03/07/2025",
        },
        {
            comment: "Personnel très humain, on sent qu’ils prennent leur mission à cœur.",
            date: "09/07/2025",
        },
        {
            comment: "Climatisation défaillante, très inconfortable en pleine chaleur.",
            date: "14/07/2025",
        },
        {
            comment: "Professionnels attentifs et ponctuels. Bonne expérience.",
            date: "25/07/2025",
        },
        ],
        Aoû: [
        {
            comment: "Bon accueil malgré les congés. L’organisation tient la route.",
            date: "02/08/2025",
        },
        {
            comment: "IRM rapide, équipe très rassurante. Je suis repartie soulagée.",
            date: "07/08/2025",
        },
        {
            comment: "Peu d’indications, je me suis perdue dans les couloirs. Mauvaise signalisation.",
            date: "12/08/2025",
        },
        {
            comment: "Merci au personnel présent en août, très pro malgré les effectifs réduits.",
            date: "19/08/2025",
        },
        ],
        Sep: [
        {
            comment: "Réservation facile et prise en charge rapide. Très bon service.",
            date: "04/09/2025",
        },
        {
            comment: "On m’a tout expliqué en détail, on se sent vraiment écouté.",
            date: "09/09/2025",
        },
        {
            comment: "Ambiance stressante en salle d’attente, peu de communication du personnel.",
            date: "14/09/2025",
        },
        {
            comment: "Très bon déroulé, personnel compétent et rassurant.",
            date: "21/09/2025",
        },
        ],
        Oct: [
        {
            comment: "Tout a été parfait, de l’accueil à l’examen. Merci à tous.",
            date: "01/10/2025",
        },
        {
            comment: "Personnel calme et compétent. Je recommande sans hésiter.",
            date: "06/10/2025",
        },
        {
            comment: "Problème technique pendant mon examen, mais aucune information donnée.",
            date: "13/10/2025",
        },
        {
            comment: "Centre agréable et bien équipé. Très bonne prise en charge.",
            date: "19/10/2025",
        },
        ],
        Nov: [
        {
            comment: "Equipe chaleureuse, tout s’est bien déroulé. Merci pour votre accueil.",
            date: "05/11/2025",
        },
        {
            comment: "Organisation impeccable. Je suis très satisfaite du service.",
            date: "10/11/2025",
        },
        {
            comment: "Accueil froid, on ne vous regarde même pas quand vous entrez.",
            date: "14/11/2025",
        },
        {
            comment: "Très bonne gestion du planning. Pas d’attente, très fluide.",
            date: "20/11/2025",
        },
        ],
        Déc: [
        {
            comment: "Même pendant les fêtes, le personnel est resté pro et accueillant.",
            date: "03/12/2025",
        },
        {
            comment: "Locaux impeccables, personnel à l’écoute. Rien à redire.",
            date: "08/12/2025",
        },
        {
            comment: "On sent une fatigue dans l’équipe. Moins de sourires, accueil distant.",
            date: "14/12/2025",
        },
        {
            comment: "Merci pour votre efficacité et votre gentillesse en cette fin d’année.",
            date: "22/12/2025",
        },
        ],
    },
    ]
  },
  {
    email: 'compte_centre3@mail.fr',
    metrics: [
        { month: "Jan", fullMonth: "Janvier", rdv: 33, accueil: 62, examen: 74, secretaire: 71, attente: 30, moyenne: 54 },
        { month: "Fév", fullMonth: "Février", rdv: 29, accueil: 58, examen: 76, secretaire: 70, attente: 31, moyenne: 53 },
        { month: "Mar", fullMonth: "Mars", rdv: 26, accueil: 60, examen: 72, secretaire: 73, attente: 32, moyenne: 53 },
        { month: "Avr", fullMonth: "Avril", rdv: 28, accueil: 55, examen: 75, secretaire: 70, attente: 30, moyenne: 52 },
        { month: "Mai", fullMonth: "Mai", rdv: 24, accueil: 57, examen: 74, secretaire: 72, attente: 33, moyenne: 52 },
        { month: "Juin", fullMonth: "Juin", rdv: 31, accueil: 50, examen: 78, secretaire: 71, attente: 30, moyenne: 52 },
        { month: "Juil", fullMonth: "Juillet", rdv: 27, accueil: 61, examen: 70, secretaire: 74, attente: 32, moyenne: 53 },
        { month: "Aoû", fullMonth: "Août", rdv: 25, accueil: 53, examen: 76, secretaire: 75, attente: 34, moyenne: 53 },
        { month: "Sep", fullMonth: "Septembre", rdv: 30, accueil: 59, examen: 73, secretaire: 70, attente: 28, moyenne: 52 },
        { month: "Oct", fullMonth: "Octobre", rdv: 22, accueil: 56, examen: 75, secretaire: 72, attente: 31, moyenne: 51 },
        { month: "Nov", fullMonth: "Novembre", rdv: 29, accueil: 60, examen: 70, secretaire: 73, attente: 26, moyenne: 52 },
        { month: "Déc", fullMonth: "Décembre", rdv: 30, accueil: 52, examen: 77, secretaire: 71, attente: 28, moyenne: 52 }
    ],
    comments: [
        {
        Jan: [
        { comment: "Rendez-vous pris facilement, personnel très accueillant. Tout s’est bien déroulé.", date: "04/01/2025" },
        { comment: "Première visite dans ce centre, très bonne impression. L’équipe est disponible et souriante.", date: "08/01/2025" },
        { comment: "Accueil agréable et locaux bien entretenus. Je recommande ce service.", date: "12/01/2025" },
        { comment: "Trop d’attente malgré l’heure du rendez-vous respectée. Mauvaise organisation en salle d’attente.", date: "20/01/2025" },
        ],
        Fév: [
        { comment: "Très bon accompagnement avant et après l’examen. Personnel rassurant.", date: "03/02/2025" },
        { comment: "Tout était clair et fluide, aucune mauvaise surprise. Merci à toute l’équipe.", date: "10/02/2025" },
        { comment: "Service impeccable et rapide. J’ai été prise à l’heure et bien informée.", date: "17/02/2025" },
        { comment: "Peu d’explications données, on est un peu laissé à soi-même avant l’examen.", date: "22/02/2025" },
        ],
        Mar: [
        { comment: "Centre très moderne, prise en charge rapide. Merci pour votre efficacité.", date: "05/03/2025" },
        { comment: "Le personnel a pris le temps de me rassurer, ce qui a rendu l’examen plus facile.", date: "11/03/2025" },
        { comment: "Bonne coordination entre les équipes. J’ai été bien guidée du début à la fin.", date: "18/03/2025" },
        { comment: "Accueil impersonnel, on ne se sent pas écouté. Expérience mitigée.", date: "25/03/2025" },
        ],
        Avr: [
        { comment: "Équipe très humaine, j’ai senti une vraie attention portée aux patients.", date: "02/04/2025" },
        { comment: "Merci pour votre professionnalisme et votre gentillesse. Examen sans stress.", date: "07/04/2025" },
        { comment: "Accueil très fluide, tout s’est enchaîné naturellement. Bravo à l’équipe.", date: "15/04/2025" },
        { comment: "On m’a à peine expliqué le déroulement, c’était expéditif.", date: "21/04/2025" },
        ],
        Mai: [
        { comment: "Secrétaires très efficaces, service rapide et agréable. Je recommande.", date: "03/05/2025" },
        { comment: "Professionnels à l’écoute, ambiance rassurante. Merci pour votre bienveillance.", date: "12/05/2025" },
        { comment: "Organisation parfaite, j’ai été prise sans attente. Très bonne expérience.", date: "20/05/2025" },
        { comment: "Manque d’indications sur les consignes à suivre. On est un peu perdu.", date: "25/05/2025" },
        ],
        Juin: [
        { comment: "Personnel chaleureux, tout est fait pour qu’on se sente en confiance.", date: "01/06/2025" },
        { comment: "Très bon accueil, l’équipe est disponible et les locaux sont propres.", date: "09/06/2025" },
        { comment: "Prise en charge rapide, et résultats transmis dans les temps. Merci à tous.", date: "17/06/2025" },
        { comment: "Accueil froid, pas de sourire ni d’accompagnement, dommage.", date: "22/06/2025" },
        ],
        Juil: [
        { comment: "Malgré la chaleur, le personnel a su rester professionnel et efficace.", date: "04/07/2025" },
        { comment: "Très bon suivi avant et après l’IRM. Excellente organisation.", date: "11/07/2025" },
        { comment: "On sent un vrai respect du patient, tout est fait avec tact et douceur.", date: "16/07/2025" },
        { comment: "On attend longtemps en salle sans explication. Manque de communication.", date: "21/07/2025" },
        ],
        Aoû: [
        { comment: "Même en plein été, le service reste efficace et humain. Bravo.", date: "05/08/2025" },
        { comment: "Accueil souriant, professionnels impliqués. Une expérience très positive.", date: "10/08/2025" },
        { comment: "Tout s’est très bien passé, du rendez-vous à la sortie. Merci à l’équipe.", date: "18/08/2025" },
        { comment: "Service ralenti en août, beaucoup d’attente et peu de personnel visible.", date: "23/08/2025" },
        ],
        Sep: [
        { comment: "Bon accompagnement, on m’a expliqué chaque étape. Très rassurant.", date: "02/09/2025" },
        { comment: "Personnel très doux, l’examen s’est déroulé sans stress. Merci.", date: "08/09/2025" },
        { comment: "Salle d’attente calme, bonne gestion du temps et des patients.", date: "15/09/2025" },
        { comment: "Accueil impersonnel, ambiance tendue, pas très agréable.", date: "21/09/2025" },
        ],
        Oct: [
        { comment: "Rien à redire, tout était bien coordonné et le personnel très attentionné.", date: "03/10/2025" },
        { comment: "Les explications avant l’examen étaient claires. Très bon contact humain.", date: "10/10/2025" },
        { comment: "Une équipe à l’écoute et rassurante. Je recommande ce centre.", date: "16/10/2025" },
        { comment: "L’accueil téléphonique était désagréable. Pas de patience ni de courtoisie.", date: "22/10/2025" },
        ],
        Nov: [
        { comment: "Merci à toute l’équipe pour sa réactivité et son professionnalisme.", date: "04/11/2025" },
        { comment: "Locaux très propres, on se sent bien dès l’entrée. Très bon centre.", date: "09/11/2025" },
        { comment: "Rapidité, écoute, respect du patient. Très bonne prise en charge.", date: "15/11/2025" },
        { comment: "Peu de signalisation, difficile de s’y retrouver. Manque d’organisation.", date: "20/11/2025" },
        ],
        Déc: [
        { comment: "Même en fin d’année, le service reste impeccable. Merci à tous.", date: "01/12/2025" },
        { comment: "Équipe très humaine et souriante malgré l’affluence. Belle expérience.", date: "08/12/2025" },
        { comment: "Très bon contact avec le personnel, je me suis sentie accompagnée.", date: "14/12/2025" },
        { comment: "Rendez-vous en retard, attente prolongée et pas d’excuses. Gênant.", date: "19/12/2025" },
        ],
    }
    ]
  }
]

async function main() {
  const explainProduct = await prisma.product.findUnique({
    where: { name: 'LyraeExplain' }
  })
  if (!explainProduct) {
    throw new Error('Produit LyraeExplain introuvable')
  }

  for (const centreData of dataByCentre) {
    const user = await prisma.user.findUnique({
      where: { email: centreData.email }
    })
    if (!user) {
      console.warn(`Utilisateur introuvable pour ${centreData.email}, skipping.`)
      continue
    }

    const up = await prisma.userProduct.findUnique({
      where: {
        userId_productId: {
          userId: user.id,
          productId: explainProduct.id
        }
      }
    })
    if (!up) {
      console.warn(`UserProduct non trouvé pour ${centreData.email}, skipping.`)
      continue
    }

    await prisma.lyraeExplainDetails.upsert({
      where: { userProductId: up.id },
      update: {
        metricsByMonth: centreData.metrics,
        commentsByMonth: centreData.comments,
        metricsUpdatedAt: new Date()
      },
      create: {
        userProductId: up.id,
        metricsByMonth: centreData.metrics,
        commentsByMonth: centreData.comments,
        metricsUpdatedAt: new Date()
      }
    })

    console.log(`Seed terminé pour ${centreData.email}`)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
