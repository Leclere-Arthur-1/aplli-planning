# Mes tournées clients — première version

Application React reliée au schéma `supabase_tournees.sql`. Cette première étape comprend l'authentification, l'import du classeur Excel, la recherche des clients et les paramètres de travail. Le planning, la carte et l'optimisation des trajets sont les étapes suivantes.

## Démarrage local

1. Installer Node.js récent, puis lancer `npm install`.
2. Copier `.env.example` en `.env.local` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` avec les valeurs du projet Supabase **où le schéma a été exécuté**.
3. Lancer `npm run dev` et ouvrir l'adresse affichée.
4. Créer un compte dans l'application. Selon la configuration Supabase Auth, confirmer l'adresse e-mail avant de se connecter.

Ne jamais enregistrer une clé `secret` ou `service_role` dans ce projet. La clé publishable est destinée au navigateur ; les politiques RLS du schéma limitent chaque utilisateur à ses propres données.

## Mise en ligne gratuite

Le dépôt public est prévu pour GitHub Pages à l'adresse `https://leclere-arthur-1.github.io/aplli-planning/`. Dans **Settings → Pages → Build and deployment → Source**, sélectionner **GitHub Actions**. Le workflow `.github/workflows/pages.yml` construit et publie l'application à chaque modification de `main`. Le fichier `.env.production` ne contient que l'URL et la clé **publishable** du projet ; ne jamais y mettre une clé secrète.

Dans Supabase, ouvrir **Authentication → URL Configuration** et définir **Site URL** sur l'adresse GitHub Pages ci-dessus. Ajouter éventuellement `http://localhost:5173/**` aux **Redirect URLs** pour les essais locaux. La confirmation par e-mail pourra ainsi revenir vers le site publié.

## Import

Utiliser l'onglet `Clients` du modèle fourni. La ligne d'exemple marquée `EXEMPLE FICTIF` est ignorée. Les mois visités portent `Oui` ; les autres restent vides. Les jours exclus et les créneaux horaires sont facultatifs. L'application reconnaît un client par son nom et son code postal, génère un identifiant interne automatiquement et met à jour les clients correspondants lors des imports suivants. Éviter deux clients de même nom dans le même code postal. En cas de changement du nom ou du code postal, corriger l'ancien client avant un nouvel import pour éviter un doublon. Le fichier est lu dans le navigateur, et seuls les enregistrements validés sont envoyés à Supabase. Les coordonnées latitude/longitude ne sont pas encore produites par l'import.

## Limites de cette étape

Le planning automatique et la carte ne sont pas encore disponibles. Les dates de visite ne sont donc pas encore calculées ; la recherche porte sur le nom, l'identifiant et la ville. La géolocalisation des adresses nécessitera un contrôle de qualité avant de servir aux tournées.
