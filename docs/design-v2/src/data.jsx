/* Fake data — CH-FR realistic */

const CANDIDATS = [
  { id: "c001", prenom: "Salim",    nom: "Benchaar",      titre: "Maçon CFC",                  local: "Monthey, VS",      tel: "+41 79 421 09 12", email: "s.benchaar@bluewin.ch", pipe: "entretien", nouveau: true,  score: 94, consultant: "João",  competences: ["Gros œuvre", "Coffrage", "Lecture plans"], dispo: "Immédiate",   exp: "14 ans" },
  { id: "c002", prenom: "Manuela",  nom: "Fragoso Costa", titre: "Aide-soignante",             local: "Martigny, VS",     tel: "+41 78 612 44 03", email: "manuelafc@gmail.com",   pipe: "contacte",  nouveau: true,  score: 88, consultant: "Seb",   competences: ["EMS", "Soins palliatifs", "Équipe"], dispo: "Mai 2026",    exp: "9 ans" },
  { id: "c003", prenom: "Thierry",  nom: "Dubois",        titre: "Chef de chantier",           local: "Sion, VS",         tel: "+41 79 203 88 71", email: "t.dubois@hotmail.ch",   pipe: "place",     nouveau: false, score: 92, consultant: "João",  competences: ["Coordination", "Lecture plans", "Sécurité"], dispo: "—",       exp: "22 ans" },
  { id: "c004", prenom: "Ana",      nom: "Dos Santos",    titre: "Opératrice CNC",             local: "Bex, VD",          tel: "+41 77 851 23 14", email: "ana.dssantos@gmail.com",pipe: "nouveau",   nouveau: true,  score: 76, consultant: "Seb",   competences: ["Fanuc", "Réglage", "Contrôle qualité"], dispo: "Juin 2026",   exp: "6 ans" },
  { id: "c005", prenom: "Jean-Marc",nom: "Rapaz",         titre: "Électricien de montage",     local: "Aigle, VD",        tel: "+41 79 557 01 88", email: "jmrapaz@gmail.com",     pipe: "nouveau",   nouveau: false, score: 71, consultant: "João",  competences: ["Schémas", "SIN", "SUVA"], dispo: "Immédiate",   exp: "11 ans" },
  { id: "c006", prenom: "Ayoub",    nom: "Khelil",        titre: "Manœuvre polyvalent",        local: "Monthey, VS",      tel: "+41 76 233 65 10", email: "ayoub.kh@gmail.com",    pipe: "contacte",  nouveau: true,  score: 68, consultant: "Seb",   competences: ["Démolition", "Isolation", "Permis B"], dispo: "Immédiate",   exp: "4 ans" },
  { id: "c007", prenom: "Pedro",    nom: "Ferreira",      titre: "Peintre en bâtiment",        local: "Monthey, VS",      tel: "+41 78 118 92 44", email: "p.ferreira@bluewin.ch", pipe: "entretien", nouveau: false, score: 82, consultant: "João",  competences: ["Façade", "Crépi", "Airless"], dispo: "Immédiate",   exp: "15 ans" },
  { id: "c008", prenom: "Marine",   nom: "Oberson",       titre: "Assistante RH",              local: "Vevey, VD",        tel: "+41 79 992 17 52", email: "m.oberson@proton.me",   pipe: "refuse",    nouveau: false, score: 61, consultant: "Seb",   competences: ["Paie", "SAP SuccessFactors", "Anglais"], dispo: "Juin 2026",   exp: "7 ans" },
  { id: "c009", prenom: "Slavko",   nom: "Petrović",      titre: "Ferrailleur",                local: "Martigny, VS",     tel: "+41 78 440 33 19", email: "slavko.p@gmail.com",    pipe: "nouveau",   nouveau: true,  score: 74, consultant: "João",  competences: ["Armatures", "Grande hauteur", "Permis C"], dispo: "Immédiate", exp: "13 ans" },
  { id: "c010", prenom: "Aurélie",  nom: "Morard",        titre: "Secrétaire médicale",        local: "Sion, VS",         tel: "+41 79 602 78 01", email: "a.morard@bluewin.ch",   pipe: "contacte",  nouveau: false, score: 85, consultant: "Seb",   competences: ["Elexis", "Facturation LAMal", "Accueil"], dispo: "—",        exp: "12 ans" },
  { id: "c011", prenom: "Mohamed",  nom: "Tahiri",        titre: "Chauffeur poids lourds",     local: "Aigle, VD",        tel: "+41 76 712 04 33", email: "m.tahiri@gmail.com",    pipe: "nouveau",   nouveau: true,  score: 70, consultant: "João",  competences: ["CE", "ADR", "Tachygraphe"], dispo: "Immédiate",   exp: "8 ans" },
  { id: "c012", prenom: "Sandra",   nom: "Rouiller",      titre: "Cheffe de projet construction",local: "Sion, VS",       tel: "+41 79 443 21 06", email: "s.rouiller@outlook.com",pipe: "entretien", nouveau: false, score: 90, consultant: "João",  competences: ["SIA 118", "MEP", "Planification"], dispo: "Sept 2026", exp: "18 ans" },
  { id: "c013", prenom: "Ivan",     nom: "Da Silva",      titre: "Soudeur TIG/MAG",            local: "Monthey, VS",      tel: "+41 78 205 94 87", email: "ivan.dasilva@gmx.ch",   pipe: "place",     nouveau: false, score: 87, consultant: "Seb",   competences: ["Inox", "Procédé 135", "ISO 9606"], dispo: "—",       exp: "10 ans" },
  { id: "c014", prenom: "Émilie",   nom: "Crettenand",    titre: "Apprentie assistante socio-éducative", local: "Martigny, VS", tel: "+41 77 381 02 19", email: "e.crettenand@edu.vs.ch", pipe: "contacte", nouveau: true, score: 58, consultant: "Seb", competences: ["Enfance", "Animation"], dispo: "Août 2026", exp: "0 an" },
];

const KPI = [
  { id:"candidats",  label:"Candidats actifs", value:4612, trend:+8.2, sub:"vs. mois dernier",
    spark:[30,32,31,34,36,34,38,41,39,42,44,46] },
  { id:"entretiens", label:"En entretien",     value:87,   trend:+12.4,sub:"7 cette semaine",
    spark:[4,6,5,7,8,9,7,10,9,11,12,12] },
  { id:"places",     label:"Placements mois",  value:23,   trend:-3.1, sub:"objectif 30",
    spark:[2,3,2,4,3,5,4,5,3,4,3,2] },
  { id:"cvs",        label:"CVs importés 7j",  value:184,  trend:+22.8,sub:"sync OneDrive ok",
    spark:[12,18,14,20,22,28,24,32,26,30,34,38] },
];

const SERIES_12M = [
  { m:"Mai", entrants: 210, places: 18 },
  { m:"Juin", entrants: 240, places: 22 },
  { m:"Juil", entrants: 196, places: 16 },
  { m:"Août", entrants: 180, places: 14 },
  { m:"Sept", entrants: 264, places: 28 },
  { m:"Oct", entrants: 302, places: 33 },
  { m:"Nov", entrants: 288, places: 31 },
  { m:"Déc", entrants: 190, places: 19 },
  { m:"Janv", entrants: 340, places: 36 },
  { m:"Févr", entrants: 322, places: 29 },
  { m:"Mars", entrants: 368, places: 34 },
  { m:"Avr", entrants: 402, places: 23 },
];

const PIPE_STAGES = [
  { id:"nouveau",   label:"Nouveaux",  color:"var(--pipe-nouveau)"   },
  { id:"contacte",  label:"Contactés", color:"var(--pipe-contacte)"  },
  { id:"entretien", label:"Entretien", color:"var(--pipe-entretien)" },
  { id:"place",     label:"Placés",    color:"var(--pipe-place)"     },
];

const ACTIVITES = [
  { who:"João",  action:"a déplacé",  quoi:"Salim Benchaar",   to:"Entretien",  when:"il y a 12 min", dot:"var(--pipe-entretien)"},
  { who:"Seb",   action:"a matché",   quoi:"Ana Dos Santos",   to:"Usine Monthey CNC",  when:"il y a 38 min", dot:"var(--indigo)"},
  { who:"Sync",  action:"a importé",  quoi:"12 CVs",           to:"OneDrive /Candidats/2026-04", when:"il y a 1 h", dot:"var(--emerald)"},
  { who:"João",  action:"a envoyé",   quoi:"Proposition CV",   to:"Bétonnière SA (Sion)", when:"il y a 2 h", dot:"var(--gold-500)"},
  { who:"Seb",   action:"a créé",     quoi:"Offre",            to:"Soudeur TIG — Martigny", when:"il y a 4 h", dot:"var(--pipe-contacte)"},
  { who:"João",  action:"a noté",     quoi:"Pedro Ferreira",   to:"Permis C — à vérifier",  when:"il y a 5 h", dot:"var(--slate)"},
];

const RAPPELS = [
  { candidat:"Salim Benchaar", quoi:"Appel retour entretien Hilti", quand:"Aujourd'hui 14:30", urgence:"high" },
  { candidat:"Ana Dos Santos", quoi:"Envoyer CV à Usine Monthey",   quand:"Demain 09:00",      urgence:"med"  },
  { candidat:"Pedro Ferreira", quoi:"Relance permis C",             quand:"Jeu. 17 avr.",       urgence:"low"  },
];

const OFFRES = [
  { cli:"Béton SA",          poste:"Maçon CFC",            where:"Sion",       jours:2, candidats:8,  urgent:true },
  { cli:"Usine Monthey",     poste:"Opérateur CNC",        where:"Monthey",    jours:5, candidats:3,  urgent:false },
  { cli:"Clinique du Valais",poste:"Aide-soignante",       where:"Martigny",   jours:1, candidats:12, urgent:true },
];

Object.assign(window, { CANDIDATS, KPI, SERIES_12M, PIPE_STAGES, ACTIVITES, RAPPELS, OFFRES });
