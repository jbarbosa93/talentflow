// Templates France Travail — L-Agence SA
// Champs communs à presque tous les postes : horaire 6h30–17h30, 40-45h, Valais-Vaud, exp 5-10 ans

export interface FTTemplate {
  titre: string
  description: string
  qualification: string
  formation: string
  connaissances: string
  experience: string
  debutant: boolean
  exp_type: 'exigee' | 'souhaitee'
  exp_annees: string
  contrat: 'cdi' | 'cdd'
  duree_cdd: string
  horaire: string
  heures_hebdo: string
  temps_partiel: boolean
  precision_horaires: string
  lieu: string
}

// Valeurs par défaut communes
const BASE: Omit<FTTemplate, 'titre' | 'description' | 'qualification' | 'formation' | 'connaissances' | 'experience'> = {
  debutant: false,
  exp_type: 'souhaitee',
  exp_annees: '5-10',
  contrat: 'cdi',
  duree_cdd: 'Poste à l\'année',
  horaire: '6h30 – 17h30',
  heures_hebdo: '40-45',
  temps_partiel: false,
  precision_horaires: 'Horaires journaliers',
  lieu: 'Valais – Vaud',
}

export const FT_TEMPLATES: FTTemplate[] = [
  // ─── SOUDURE ────────────────────────────────────────────────────────────────
  {
    ...BASE,
    titre: 'Soudeur 135 – 136 – 138',
    description: `Lire et interpréter les instructions techniques fournies par les ingénieurs ou les techniciens
Déterminer la technique de soudure appropriée au type de métal utilisé et l'appliquer
Choisir le métal d'apport, tenir compte de la résistance du cordon de soudage
Monter et fixer les pièces à assembler
Contrôler la qualité de la soudure, tester et s'assurer qu'elle réponde aux exigences
Observer et faire respecter les prescriptions de sécurité sur le lieu de travail`,
    qualification: 'Ouvrier qualifié',
    formation: '',
    connaissances: 'Lecture de plans, soudure MIG/MAG, Français courant',
    experience: 'Soudure industrielle, chaudronnerie – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Soudeur 141 (TIG)',
    description: `Effectuer des soudures TIG sur acier carbone et inox selon les procédés 141
Lire et interpréter les plans et instructions techniques
Préparer et assembler les pièces à souder
Contrôler la qualité des soudures et corriger les défauts
Maintenir ses licences de soudage à jour
Respecter les consignes de sécurité et les normes en vigueur`,
    qualification: 'Ouvrier qualifié – licences à jour (acier carbone + inox)',
    formation: '',
    connaissances: 'Procédé TIG 141, lecture de plans, Français courant',
    experience: 'Soudure TIG industrielle – 5 à 10 ans',
    lieu: 'Valais – Vaud – Neuchâtel – Fribourg – Genève',
  },
  {
    ...BASE,
    titre: 'Soudeur 111 (Électrode)',
    description: `Réaliser des soudures à l'électrode enrobée (procédé 111)
Lire et interpréter les plans et instructions techniques
Préparer les surfaces, ajuster et assembler les pièces
Contrôler la conformité des soudures selon les exigences
Effectuer les retouches et corrections si nécessaire
Respecter les règles de sécurité sur le chantier`,
    qualification: 'Ouvrier qualifié',
    formation: '',
    connaissances: 'Procédé 111, lecture de plans, Français courant',
    experience: 'Soudure à l\'électrode – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Soudeur 142 (TIG Automatique)',
    description: `Opérer des équipements de soudage TIG automatisé (procédé 142)
Régler les paramètres de la machine selon les spécifications
Lire et interpréter les plans et fiches techniques
Contrôler la qualité des soudures et ajuster les réglages
Assurer la maintenance de premier niveau des équipements
Respecter les normes de sécurité et de qualité`,
    qualification: 'Ouvrier qualifié chef d\'équipe',
    formation: '',
    connaissances: 'TIG automatique, réglage machines, lecture de plans',
    experience: 'Soudure automatisée industrielle – 5 à 10 ans',
  },

  // ─── BÂTIMENT / GROS ŒUVRE ──────────────────────────────────────────────────
  {
    ...BASE,
    titre: 'Maçon – Gros Œuvre',
    description: `Réaliser des travaux de maçonnerie et de gros œuvre
Couler des fondations, élever des murs et cloisons
Lire les plans de construction et respecter les côtes
Poser des armatures et réaliser des coffrages
Travailler en équipe et coordonner avec les autres corps de métier
Respecter les règles de sécurité sur le chantier`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, Permis B, Français courant',
    experience: 'Gros œuvre, maçonnerie – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Ferrailleur',
    description: `Lire et interpréter les plans de ferraillage
Couper, façonner et assembler les armatures en acier
Positionner et fixer les armatures dans les coffrages selon les plans
Contrôler la conformité du ferraillage avant coulage du béton
Travailler en coordination avec les coffreurs et maçons
Respecter les consignes de sécurité sur chantier`,
    qualification: 'Ouvrier qualifié',
    formation: '',
    connaissances: 'Lecture de plans, travail en hauteur, Français courant',
    experience: 'Ferraillage, armatures béton – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Constructeur de routes',
    description: `Réaliser des travaux de construction et réfection de routes et voiries
Préparer les sous-couches et couches d'assise
Poser l'enrobé bitumineux et les revêtements routiers
Utiliser les engins de chantier et machines de pose
Assurer le réglage et le compactage des matériaux
Respecter les plans et les tolérances géométriques`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Conduite d\'engins, Permis C souhaité, Français courant',
    experience: 'Construction routière, terrassement – 5 à 10 ans',
    lieu: 'Valais – Vaud',
  },
  {
    ...BASE,
    titre: 'Terrassier – Opérateur Engins',
    description: `Effectuer des travaux de terrassement, fouilles et nivellement
Conduire et manœuvrer les engins de chantier (pelle, chargeuse, compacteur)
Réaliser des tranchées pour réseaux enterrés
Remblayer et compacter les zones d'intervention
Signaler les anomalies et respecter les plans de chantier
Observer les règles de sécurité sur le chantier`,
    qualification: 'Ouvrier qualifié',
    formation: '',
    connaissances: 'CACES engins, Permis C, Français courant',
    experience: 'Terrassement, conduite d\'engins – 5 à 10 ans',
    lieu: 'Vaud',
    horaire: '7h00 – 17h30',
    heures_hebdo: '40',
  },

  // ─── SECOND ŒUVRE ────────────────────────────────────────────────────────────
  {
    ...BASE,
    titre: 'Charpentier',
    description: `Lire et interpréter les plans de charpente
Tailler, assembler et poser les éléments de charpente bois
Réaliser les structures de toiture et les planchers bois
Effectuer la pose et la fixation des pièces de bois
Contrôler l'aplomb, le niveau et la conformité des ouvrages
Respecter les délais et les normes de sécurité sur les chantiers`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, travail en hauteur, Permis B, Français courant',
    experience: 'Charpente bois, ossature – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Couvreur',
    description: `Poser et entretenir les différents types de couvertures (tuiles, ardoises, zinc, bac acier)
Réaliser les noues, faîtages, solins et raccords d'étanchéité
Assurer l'évacuation des eaux pluviales (gouttières, descentes)
Effectuer des travaux de réparation et rénovation de toitures
Travailler en hauteur en respectant les règles de sécurité
Lire et interpréter les plans et fiches techniques`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Travail en hauteur, harnais, Permis B, Français courant',
    experience: 'Couverture, toiture – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Carreleur',
    description: `Préparer les surfaces à carreler (ragréage, imperméabilisation, traçage)
Poser des carrelages, faïences et revêtements de sol selon les plans
Réaliser les joints et finitions
Effectuer les coupes et découpes selon les mesures
Contrôler la planéité et l'alignement des revêtements
Respecter les délais et les consignes de sécurité`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, découpe carrelage, Français courant',
    experience: 'Carrelage, revêtements de sol et mur – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Peintre en bâtiment',
    description: `Préparer les surfaces à peindre (lessivage, ponçage, enduits, rebouchage)
Appliquer peintures, vernis et laques sur tous supports
Poser des revêtements muraux (papier peint, tissu de verre)
Effectuer les travaux de finition soignés
Nettoyer et protéger les zones de travail
Respecter les délais, les consignes de sécurité et les normes environnementales`,
    qualification: 'Ouvrier qualifié – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, Permis B souhaité, Français courant',
    experience: 'Peinture bâtiment intérieure et extérieure – 5 à 10 ans',
    lieu: 'Valais – Lausanne',
  },
  {
    ...BASE,
    titre: 'Peintre Façadier',
    description: `Réaliser des travaux de peinture et ravalement de façades
Préparer les surfaces (nettoyage haute pression, ponçage, rebouchage)
Poser des enduits de façade et revêtements décoratifs
Effectuer des travaux sur échafaudage ou nacelle
Contrôler la qualité des finitions et des raccords
Respecter les règles de sécurité en hauteur et les délais de chantier`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Travail en hauteur, échafaudage, Permis B, Français courant',
    experience: 'Peinture façade, ravalement – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Plâtrier',
    description: `Réaliser des travaux de plâtrerie, staff et faux-plafonds
Poser des cloisons sèches, plaques de plâtre et isolants
Effectuer les enduits, ragréages et finitions
Lire et interpréter les plans d'agencement intérieur
Travailler en coordination avec les autres corps de métier
Respecter les délais et normes de qualité`,
    qualification: 'Ouvrier qualifié – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, Permis B, Français courant',
    experience: 'Plâtrerie, faux-plafonds, cloisons – 5 à 10 ans',
    lieu: 'Valais – Lausanne',
  },
  {
    ...BASE,
    titre: 'Électricien',
    description: `Réaliser des installations électriques dans le respect des normes en vigueur
Lire et interpréter les schémas électriques et plans
Tirer les câbles, poser les appareillages et équipements
Effectuer les raccordements et la mise en service des installations
Diagnostiquer et réparer les pannes électriques
Respecter les normes de sécurité électrique (NFC 15-100 ou équivalent)`,
    qualification: 'Ouvrier qualifié – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de schémas, habilitations électriques, Permis B, Français courant',
    experience: 'Électricité bâtiment et industrielle – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Installateur Sanitaire',
    description: `Installer et raccorder les équipements sanitaires (robinetterie, WC, baignoires, douches)
Poser les tuyauteries d'alimentation en eau et d'évacuation
Lire et interpréter les plans de plomberie
Effectuer les tests d'étanchéité et de pression
Diagnostiquer et réparer les fuites et pannes
Respecter les normes sanitaires et de sécurité en vigueur`,
    qualification: 'Ouvrier qualifié',
    formation: '',
    connaissances: 'Lecture de plans, Permis B, Français courant',
    experience: 'Plomberie, installations sanitaires – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Installateur en chauffage',
    description: `Installer et raccorder les systèmes de chauffage (chaudières, pompes à chaleur, planchers chauffants)
Poser les tuyauteries et radiateurs selon les plans
Effectuer les réglages et mises en service des installations
Diagnostiquer et réparer les pannes de chauffage
Assurer la maintenance préventive et curative des équipements
Respecter les normes techniques et de sécurité`,
    qualification: 'Ouvrier qualifié – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, Permis B, Français courant',
    experience: 'Chauffage, installations thermiques – 5 à 10 ans',
    lieu: 'Valais – Vaud – Genève',
  },
  {
    ...BASE,
    titre: 'Ferblantier',
    description: `Fabriquer et poser les éléments de ferblanterie (gouttières, descentes, habillages)
Travailler les métaux en feuilles (zinc, cuivre, acier galvanisé, aluminium)
Réaliser les étanchéités et raccords de toiture
Poser les bardages métalliques et faîtages
Effectuer les découpes et pliages selon les plans
Respecter les règles de sécurité en hauteur`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Travail en hauteur, lecture de plans, Permis B, Français courant',
    experience: 'Ferblanterie, étanchéité toiture – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Étancheur',
    description: `Réaliser des travaux d'étanchéité sur toitures, terrasses et ouvrages enterrés
Préparer les supports (nettoyage, primaire, ragréage)
Poser les membranes d'étanchéité (bitumineuses, synthétiques, liquides)
Réaliser les relevés, noues et points singuliers
Effectuer les contrôles d'étanchéité (test eau, vide)
Respecter les règles de sécurité sur les toitures`,
    qualification: 'Ouvrier expérimenté ou qualifié (autonome)',
    formation: '',
    connaissances: 'Travail en hauteur, torche à gaz, Permis B, Français courant',
    experience: 'Étanchéité toitures et ouvrages – minimum 3 ans',
    exp_annees: '3+',
    lieu: 'Valais – Vaud – Genève',
    horaire: '7h00 – 17h00',
  },
  {
    ...BASE,
    titre: 'Monteur en ventilation',
    description: `Installer et raccorder les réseaux de ventilation et climatisation
Poser les gaines, conduits et bouches de ventilation selon les plans
Effectuer le montage des centrales de traitement d'air
Procéder aux réglages, équilibrages et mises en service
Diagnostiquer et réparer les pannes des systèmes VMC et CTA
Respecter les normes techniques et de sécurité en vigueur`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, Permis B, Français courant',
    experience: 'Ventilation, climatisation, CVC – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Calorifugeur – Tôlier',
    description: `Réaliser des travaux de calorifugeage sur réseaux de tuyauteries et équipements industriels
Poser les isolants thermiques (laine de roche, mousse, caoutchouc)
Habiller les isolants avec des tôles et revêtements métalliques
Lire et interpréter les plans et isométriques
Travailler en coordination avec les autres corps de métier sur chantier
Respecter les normes de sécurité et les consignes de travail en hauteur`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, travail en hauteur, Permis B, Français courant',
    experience: 'Calorifugeage, isolation industrielle – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Serrurier',
    description: `Fabriquer et poser des ouvrages de serrurerie et métallerie (portes, grilles, garde-corps, escaliers)
Lire et interpréter les plans de fabrication
Travailler les métaux par découpe, pliage, soudage et meulage
Effectuer la pose et le réglage des ouvrages sur chantier
Réaliser les finitions (ponçage, peinture, galvanisation)
Respecter les délais et normes de qualité`,
    qualification: 'Ouvrier qualifié – chef d\'équipe',
    formation: '',
    connaissances: 'Soudage MIG/MAG, lecture de plans, Permis B, Français courant',
    experience: 'Serrurerie, métallerie – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Tuyauteur',
    description: `Lire et interpréter les plans isométriques et schémas de tuyauterie
Couper, ajuster et assembler les tuyauteries selon les plans
Effectuer les soudures et/ou raccordements par bridage ou vissage
Réaliser les supports et fixations des réseaux
Effectuer les contrôles d'étanchéité et de conformité
Respecter les règles de sécurité sur les installations industrielles`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture d\'isométriques, soudage apprécié, Permis B, Français courant',
    experience: 'Tuyauterie industrielle – 5 ans et plus',
    exp_annees: '5+',
    lieu: 'Valais – Vaud – Genève – Fribourg – Neuchâtel',
  },
  {
    ...BASE,
    titre: 'Menuisier',
    description: `Fabriquer et poser des ouvrages en bois (portes, fenêtres, escaliers, meubles)
Lire et interpréter les plans et fiches de débit
Utiliser les machines de menuiserie (scie, raboteuse, toupie, CNC)
Effectuer les assemblages, collages et finitions
Poser les ouvrages chez les clients selon les plans
Respecter les délais et la qualité des finitions`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, machines de menuiserie, Permis B, Français courant',
    experience: 'Menuiserie bois, agencement – 5 à 10 ans',
    lieu: 'Valais – Lausanne',
  },
  {
    ...BASE,
    titre: 'Menuisier aluminium',
    description: `Fabriquer et poser des menuiseries en aluminium (fenêtres, portes, façades, vérandas)
Lire et interpréter les plans et calculs de thermique
Découper, usiner et assembler les profilés aluminium
Régler et poser les vitrages et accessoires
Effectuer les mesures sur chantier et vérifier les conformités
Respecter les tolérances et normes de qualité`,
    qualification: 'Ouvrier qualifié – chef d\'équipe',
    formation: '',
    connaissances: 'Lecture de plans, machines aluminium, Permis B, Français courant',
    experience: 'Menuiserie aluminium, façades – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Monteur Stores – Storiste',
    description: `Installer et poser des stores intérieurs et extérieurs (vénitiens, enrouleurs, bannes, volets)
Effectuer les prises de mesures chez les clients
Réaliser les perçages, fixations et raccordements électriques
Procéder aux réglages et aux tests de fonctionnement
Assurer le service après-vente et les réparations
Respecter les délais d'intervention et les consignes de sécurité`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Travail manuel, Permis B obligatoire, Français courant',
    experience: 'Pose de stores, fermetures – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Mécanicien de maintenance industrielle',
    description: `Assurer la maintenance préventive et curative des équipements industriels
Diagnostiquer les pannes mécaniques, pneumatiques et hydrauliques
Démonter, réparer et remonter les sous-ensembles défectueux
Régler et contrôler le bon fonctionnement des machines
Rédiger les rapports d'intervention et les fiches de maintenance
Respecter les procédures de sécurité et consignes de travail`,
    qualification: 'Mécanicien maintenance industrielle',
    formation: '',
    connaissances: 'Mécanique, pneumatique, hydraulique, lecture de plans, Français courant',
    experience: 'Maintenance industrielle – 5 à 10 ans',
    exp_annees: '5',
    heures_hebdo: '41',
  },
  {
    ...BASE,
    titre: 'Mécanicien de précision',
    description: `Usiner des pièces mécaniques de précision sur tours, fraiseuses et rectifieuses
Lire et interpréter les plans et tolérances dimensionnelles
Régler les machines-outils conventionnelles et CNC
Contrôler les pièces usinées avec les instruments de mesure
Assurer la maintenance de premier niveau des machines
Respecter les délais de production et les exigences qualité`,
    qualification: 'Ouvrier qualifié – chef d\'équipe',
    formation: '',
    connaissances: 'Métrologie, lecture de plans, CN, Français courant',
    experience: 'Usinage de précision, décolletage – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Décolleteur',
    description: `Régler et conduire des machines de décolletage (tours automatiques, multi-broches, CNC)
Lire et interpréter les plans et tolérances dimensionnelles
Effectuer les changements de séries et réglages de précision
Contrôler les pièces produites (micrométre, comparateur, projecteur de profil)
Assurer la maintenance de premier niveau des machines
Respecter les cadences et exigences qualité`,
    qualification: 'Ouvrier qualifié – technicien',
    formation: '',
    connaissances: 'Métrologie, lecture de plans, machines CNC, Français courant',
    experience: 'Décolletage, usinage – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Automaticien',
    description: `Programmer et mettre en service des automates industriels (Siemens, Schneider, Allen-Bradley)
Réaliser des schémas électriques et des programmes PLC
Effectuer le câblage et la mise en service des armoires électriques
Diagnostiquer et dépanner les pannes sur systèmes automatisés
Rédiger la documentation technique et les manuels d'utilisation
Assurer la formation des opérateurs sur les équipements`,
    qualification: 'Technicien – agent de maîtrise',
    formation: '',
    connaissances: 'PLC, variateurs, réseaux industriels, Français courant',
    experience: 'Automatismes industriels – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Mécanicien Poids Lourds',
    description: `Diagnostiquer les pannes mécaniques, électriques et électroniques sur véhicules poids lourds
Effectuer les réparations et révisions dans les délais impartis
Réaliser les contrôles périodiques et les opérations de maintenance
Utiliser les outils de diagnostic informatique (valise OBD)
Rédiger les ordres de réparation et les fiches d'intervention
Respecter les procédures de sécurité du garage`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Mécanique PL, diagnostic électronique, Permis C apprécié, Français courant',
    experience: 'Mécanique poids lourds, VUL – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Chauffeur',
    description: `Conduire des véhicules légers ou poids lourds pour la livraison ou le transport de personnel
Respecter le code de la route, les réglementations de transport et les temps de conduite
Charger, arrimer et décharger les marchandises en sécurité
Effectuer les vérifications quotidiennes du véhicule
Renseigner les documents de transport (CMR, lettres de voiture)
Assurer un service de qualité auprès des clients`,
    qualification: 'Ouvrier qualifié – chef d\'équipe',
    formation: '',
    connaissances: 'Permis B/C/CE, FIMO/FCO à jour, carte conducteur, Français courant',
    experience: 'Transport, conduite PL/VUL – 5 à 10 ans',
    lieu: 'Valais – Lausanne',
  },
  {
    ...BASE,
    titre: 'Paysagiste',
    description: `Créer et entretenir des espaces verts, jardins et aménagements extérieurs
Réaliser des plantations, gazonnages, engazonnements et semis
Effectuer la taille, l'élagage et l'entretien des végétaux
Construire des éléments de jardin (allées, terrasses, murets, bassins)
Utiliser et entretenir les machines de jardinage
Respecter les consignes de sécurité et les délais`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Conduite d\'engins légers, Permis B, Français courant',
    experience: 'Jardinage, espaces verts, création – 5 à 10 ans',
    lieu: 'Valais – Vaud',
  },
  {
    ...BASE,
    titre: 'Foreur',
    description: `Conduire et opérer des foreuses et équipements de forage sur chantiers
Réaliser des forages pour fondations, pieux, ancrages et captage d'eau
Lire et interpréter les plans de forage et études de sol
Assurer le montage et démontage du matériel de forage
Contrôler les paramètres de forage et rédiger les rapports
Respecter les règles de sécurité sur les chantiers`,
    qualification: 'Ouvrier qualifié',
    formation: '',
    connaissances: 'Conduite foreuse, Permis B/C, Français courant',
    experience: 'Forage, travaux spéciaux – 5 à 10 ans',
    lieu: 'Valais – Lausanne',
  },
  {
    ...BASE,
    titre: 'Opérateur Désamiantage',
    description: `Réaliser des travaux de désamiantage selon les procédures réglementaires
Mettre en place les confinements et zones de sécurité
Retirer les matériaux amiantés en respectant les protocoles SS3/SS4
Emballer et évacuer les déchets amiantés selon la réglementation
Effectuer les décontaminations et contrôles d'empoussièrement
Tenir les documents réglementaires (PPSPS, plan de retrait)`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Formation SS4/SS3 obligatoire, Permis B, Français courant',
    experience: 'Désamiantage, retrait amiante – 5 à 10 ans',
  },
  {
    ...BASE,
    titre: 'Poseur de résine',
    description: `Préparer les supports (grenaillage, meulage, dépoussiérage, primaire)
Appliquer les revêtements de sol en résine époxy, polyuréthane ou méthacrylate
Réaliser les ragréages et automaçonnerie si nécessaire
Effectuer les contrôles d'adhérence et d'épaisseur
Réaliser les finitions (antidérapant, marquage)
Respecter les délais de réticulation et les conditions d'application`,
    qualification: 'Ouvrier qualifié – aide ouvrier – chef d\'équipe',
    formation: '',
    connaissances: 'Application de résines, Permis B, Français courant',
    experience: 'Revêtements de sol en résine – 5 à 10 ans',
    lieu: 'Valais – Lausanne',
  },
  {
    ...BASE,
    titre: 'Calculateur Terrassement et Démolition',
    description: `Étudier les dossiers techniques et établir les métrés et devis de terrassement et démolition
Analyser les plans et études de sol pour quantifier les travaux
Rédiger les offres de prix en intégrant les coûts de main-d'œuvre, matériel et sous-traitance
Suivre l'avancement des chantiers et contrôler les coûts
Négocier avec les fournisseurs et sous-traitants
Assurer la relation avec les maîtres d'œuvre et maîtres d'ouvrage`,
    qualification: 'Technicien qualifié',
    formation: '',
    connaissances: 'Logiciels de métrés (Excel, AutoCAD), Français courant, Permis B',
    experience: 'Calcul, métrés terrassement/démolition – 5 ans et plus',
    exp_annees: '+5',
    lieu: 'Vaud',
    horaire: '7h00 – 17h30',
    heures_hebdo: '40',
  },
  {
    ...BASE,
    titre: 'Œnologue',
    description: `Superviser et coordonner les étapes de la vinification (pressurage, fermentation, élevage)
Contrôler la qualité des vins à chaque étape de production
Procéder aux analyses œnologiques et interpréter les résultats
Conseiller sur les assemblages et les traitements œnologiques
Gérer les stocks de vins et les approvisionnements en intrants
Respecter les normes d'hygiène, de qualité et les réglementations viticoles`,
    qualification: 'Cadre – employé diplômé',
    formation: 'Diplôme d\'œnologie avec expérience professionnelle confirmée',
    connaissances: 'Résistance physique, esprit méthodique, aptitude au travail en équipe, compétences techniques, polyvalence',
    experience: 'Vinification, cave – 5 ans',
    exp_annees: '5',
    horaire: '7h00–12h00 / 13h00–17h00',
    heures_hebdo: '43',
    lieu: '',
  },
]

// Nouveau poste vide
export const FT_TEMPLATE_VIDE: Omit<FTTemplate, never> = {
  titre: '',
  description: '',
  qualification: 'Ouvrier qualifié',
  formation: '',
  connaissances: '',
  experience: '',
  debutant: false,
  exp_type: 'souhaitee',
  exp_annees: '5-10',
  contrat: 'cdi',
  duree_cdd: 'Poste à l\'année',
  horaire: '6h30 – 17h30',
  heures_hebdo: '40-45',
  temps_partiel: false,
  precision_horaires: 'Horaires journaliers',
  lieu: 'Valais – Vaud',
}
