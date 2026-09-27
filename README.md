# Mes tournées clients

Application React reliée au schéma `supabase/schema.sql`. Elle comprend l'authentification, l'import du classeur Excel, la recherche des clients, les paramètres, le planning mensuel et une carte des visites.

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

Le bouton de génération répartit les passages selon les jours travaillés, jours exclus, créneaux compatibles et la durée cible passée chez les clients. Les passages sont espacés dans le mois. Les visites verrouillées, effectuées et annulées sont conservées lors du recalcul ; les autres peuvent changer de date. Une visite qui ne tient pas dans les contraintes reste « À planifier ». Déplacer une visite manuellement la verrouille.

La proximité se base sur les coordonnées enregistrées quand elles ont été vérifiées, sinon sur le code postal et la ville. Le bouton « Localiser » de la carte envoie **à la demande seulement** les adresses françaises sans coordonnées au service public IGN Géoplateforme, puis conserve le résultat dans Supabase. Il faut vérifier les positions signalées comme approximatives. La carte utilise des tuiles OpenStreetMap avec attribution visible.

Les dates proposées sont des **brouillons à vérifier** : ni les durées routières réelles ni l'heure exacte de chaque rendez-vous ne sont encore calculées. Le champ « trajet maximum souhaité » des paramètres n'est donc pas encore appliqué. Les créneaux sont testés par rapport au temps d'intervention dans la journée, mais les trajets et l'ordre de visite réclament une étape de routage supplémentaire. Ne pas considérer les dates générées comme des rendez-vous confirmés auprès des clients.
