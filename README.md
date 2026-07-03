# Tipat Mazal — plateforme de chidoukhim assistée par IA

Application complète (front + back + base de données) pour une plateforme de
Plateforme de chidoukhim centrée sur le Shadkhan : aucun profil public, aucune recherche ni
messagerie en libre-service, aucune photo publique. Tout passe par un dossier
détaillé, une vérification d'identité, puis une recherche de compatibilités
effectuée par un moteur d'IA explicable et validée par un administrateur humain.

## Pourquoi cette architecture

Le site a été construit comme une application **Node.js autonome, sans aucune
dépendance externe** (ni base de données à installer, ni `npm install` à faire
fonctionner). Ce choix est délibéré pour ce livrable : il garantit que vous
puissiez lancer le site immédiatement sur n'importe quelle machine avec Node
installé, sans risque de rupture de compatibilité de paquets. Pour un
déploiement en production à grande échelle, voir la section **Montée en
charge** plus bas : la structure du code (routes, modèles de données, moteur
de compatibilité) est conçue pour être portée telle quelle vers une pile plus
robuste (PostgreSQL, S3, file d'attente…).

## Démarrage rapide

Prérequis : [Node.js](https://nodejs.org) version 18 ou supérieure. Aucune
autre installation n'est nécessaire.

```bash
cd chidoukhim-platform
cp .env.example .env      # puis éditez .env (voir ci-dessous)
npm run seed               # crée le compte administrateur
npm start                  # démarre le serveur
```

Ouvrez ensuite `http://localhost:3000`.

*Remarque : un dossier `node_modules/` vide de sens traîne à la racine (résidu
d'un essai technique abandonné) — vous pouvez le supprimer sans risque, il
n'est utilisé par rien.*

Le compte administrateur créé par `npm run seed` utilise les identifiants
`ADMIN_EMAIL` / `ADMIN_PASSWORD` définis dans votre `.env`. Connectez-vous
avec ces identifiants sur `/connexion` pour accéder à `/admin`.

### Variables d'environnement (`.env`)

| Variable | Rôle |
|---|---|
| `SESSION_SECRET` | Obligatoire — chaîne aléatoire longue pour la sécurité des sessions |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Identifiants du compte administrateur créé par `npm run seed` |
| `SMS_PROVIDER_API_KEY` | Optionnel — sans elle, les SMS sont journalisés et le code de vérification est affiché à l'écran (mode démonstration) |
| `EMAIL_PROVIDER_API_KEY` | Optionnel — même principe pour les e-mails |
| `WHATSAPP_API_TOKEN` | Optionnel — pour les notifications WhatsApp |
| `ANTHROPIC_API_KEY` | Optionnel — non branché dans cette version ; prévu pour une future explication en langage naturel des compatibilités via l'API Claude |

**Important — mode démonstration.** Tant qu'aucun fournisseur SMS/e-mail
n'est configuré, les codes de vérification envoyés lors de l'inscription
s'affichent directement à l'écran (encadré « mode démonstration ») afin que
vous puissiez tester tout le parcours sans compte Twilio/Resend. Branchez un
vrai fournisseur avant toute mise en production (voir `src/notify.js`).

## Ce que couvre cette version

- **Page d'accueil** publique, sobre et élégante, qui explique le principe
  sans jamais exposer la moindre donnée de profil (`src/pages/public.js`).
- **Inscription + connexion** avec mot de passe haché (scrypt), sessions
  serveur (cookies `HttpOnly`), et vérification du sexe/e-mail/téléphone.
- **Parcours d'inscription en 4 étapes** : vérification e-mail/SMS → dépôt de
  pièce d'identité + selfie (stockage privé) → questionnaire personnel complet
  (~25 champs + questions ouvertes) → questionnaire du profil recherché
  (critères indispensables / secondaires / rédhibitoires).
- **Espace candidat** : uniquement le statut du dossier et les propositions de
  compatibilité validées par l'administrateur (jamais de recherche ni de
  consultation libre de profils). Chaque candidat peut se dire « intéressé »
  ou « pas intéressé » ; en cas d'intérêt mutuel, l'administrateur peut alors
  décider de partager une photo.
- **Espace administrateur** complet : liste et recherche de profils,
  fiche détaillée (infos, documents privés, notes internes avec étiquettes),
  validation/refus/suspension, suggestions de compatibilité générées par le
  moteur IA avec score et explication, création de propositions, suivi des
  compatibilités (statuts : proposée, intérêt, match mutuel, rendez-vous,
  refusée, suspendue), partage de photo au cas par cas, journal d'audit des
  actions admin, tableau de statistiques.
- **Moteur de compatibilité explicable** (`src/matching.js`) : score 0-100
  calculé à partir de l'âge, la taille, le niveau religieux, la communauté,
  la volonté de déménager, les critères indispensables/secondaires/
  rédhibitoires (analyse de texte), et une affinité de personnalité par
  recoupement des descriptions libres. Chaque score est accompagné de la
  liste des raisons qui le justifient — jamais une boîte noire.
- **Sécurité** : mots de passe hachés (scrypt + sel), sessions côté serveur,
  cookies `HttpOnly`/`SameSite=Lax`, en-têtes de sécurité (CSP, X-Frame-Options,
  nosniff…), limitation de débit sur les endpoints sensibles (inscription,
  connexion, envoi de code), vérification d'origine sur les requêtes d'état,
  documents et photos jamais servis publiquement (uniquement via routes
  protégées), `robots.txt` + balises `noindex` sur toutes les pages privées,
  journal d'audit des actions administrateur.

## Ce qui reste à brancher pour une mise en production réelle

Cette version est un **produit fonctionnel de bout en bout**, mais certains
points nécessitent vos propres comptes/clés avant un vrai lancement public :

1. **Fournisseurs de notification réels** — Twilio ou Vonage (SMS), Resend ou
   Postmark (e-mail), WhatsApp Business Cloud API. Le point d'intégration est
   `src/notify.js`.
2. **Publicité** — l'emplacement est prévu sur la page d'accueil (encadré
   « espace partenaire ») ; il suffit d'y coller votre script Google AdSense
   une fois votre compte approuvé (Google exige un site déjà en ligne avec du
   contenu réel avant validation).
3. **Montée en charge** — voir section suivante.
4. **IA sémantique avancée** — le moteur actuel est un système de règles
   pondérées, volontairement transparent et explicable (adapté à un contexte
   aussi sensible que le mariage). Pour aller plus loin, on peut ajouter une
   comparaison par embeddings sémantiques (au lieu du recoupement de mots-clés)
   ou un appel à l'API Claude pour reformuler les explications en langage
   naturel — le point d'entrée `ANTHROPIC_API_KEY` est déjà prévu dans `.env`.

## Montée en charge (de quelques centaines à plusieurs centaines de milliers d'utilisateurs)

La base de données actuelle est un fichier JSON (`data/db.json`), très
largement suffisante pour valider le concept et les premiers milliers de
dossiers. Le schéma de données (collections `users`, `profiles`, `criteria`,
`documents`, `notes`, `propositions`, `auditLogs`) est conçu pour se
transposer **sans changement de structure** vers :

- **PostgreSQL** (ou MySQL) à la place de `data/db.json` — chaque collection
  devient une table, `src/db.js` est le seul fichier à réécrire.
- **S3 / Cloudflare R2** à la place de `data/uploads/` pour les documents et
  photos privés — remplacer `saveUploadedFile()` dans
  `src/pages/onboarding.js` par un upload vers le bucket, avec URLs signées à
  courte durée de vie pour l'admin.
- **Redis** pour les sessions et la limitation de débit si l'application
  tourne sur plusieurs instances.
- **File d'attente** (SQS, BullMQ…) pour le calcul de compatibilité en tâche
  de fond dès que le nombre de profils validés dépasse quelques milliers
  (le calcul actuel, en O(n), reste instantané jusqu'à plusieurs milliers de
  profils par sexe).

## Structure du projet

```
chidoukhim-platform/
  server.js                 routeur HTTP principal, sécurité, sessions
  src/
    db.js                   accès aux données (JSON — remplaçable par SQL)
    auth.js                 hachage des mots de passe, sessions, audit
    matching.js             moteur de compatibilité explicable
    notify.js                couche notification (email/SMS/WhatsApp)
    validators.js            validations de formulaire
    render.js                gabarit HTML commun (en-tête, pied de page, SEO)
    pages/
      public.js               accueil, robots.txt, sitemap.xml
      auth.js                  inscription, connexion
      onboarding.js            vérification, documents, questionnaires
      dashboard.js             espace candidat
      admin.js                 espace administrateur complet
  public/
    style.css                  design (palette parchemin/or/vert forêt)
    app.js                     soumission des formulaires en JSON, upload
  scripts/seed.js              création du compte administrateur
  data/                        base de données + documents (créé au 1er lancement)
```

## Confidentialité — rappel des garanties techniques

- Aucune route de profil, document ou photo n'est accessible sans session
  valide et sans le bon rôle (candidat propriétaire ou administrateur).
- Les photos ne sont **jamais** exposées par une URL publique fixe : elles
  passent par des routes qui vérifient à chaque requête les droits d'accès.
- `robots.txt` interdit l'indexation de `/admin`, `/onboarding`,
  `/tableau-de-bord` et `/api` ; ces pages por