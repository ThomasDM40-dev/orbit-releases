# Changelog Orbit

## [0.43.0] - 2026-06-30
### Added
- **Expérience d'installation premium** : au tout premier lancement, Orbit accueille avec un écran animé plein écran — *Welcome → Installing → Installed Successfully*. Logo orbital animé, fond mesh vivant, particules flottantes, flèches lumineuses, barre de progression à glow, boutons magnétiques avec ripple et animation de succès. Affichée une seule fois, uniquement sur une installation neuve.

### Internal
- Nouveau composant `InstallExperience` autonome (React + Framer Motion), réutilisable et extractible vers un futur installateur `.exe` autonome. Rejouable via l'événement `orbit-show-installer`.

## [0.42.0] - 2026-06-30
### Added
- **Installateur Orbit Nova** : tout nouvel assistant d'installation aux couleurs de l'app — page de bienvenue, panneau latéral « espace profond » avec anneaux orbitaux et cœur lumineux violet→cyan, en-tête branché et icônes Orbit.
- **Glisser-déposer dans Orbit IA** : on peut désormais déposer un fichier directement sur le panneau de l'assistant pour qu'il propose quoi en faire.

### Changed
- **IA locale plus rapide** : moteur allégé pour les PC modestes (contexte réduit, threads calés sur les cœurs physiques) et réponses plus vives.
- **Assistant IA — progression visible** : au 1er lancement, le panneau affiche le vrai stade (téléchargement du modèle ~2 Go, démarrage…) avec barre de progression, au lieu de rester bloqué sur « Réflexion… ».

### Fixed
- **Drop = IA partout** : déposer un fichier n'importe où n'ouvre plus l'assistant IA par erreur ; seules les vraies zones de dépôt réagissent.

### Internal
- Métadonnées éditeur (`author`/`description`) ajoutées au build — réduit légèrement les faux positifs antivirus.

## [0.41.0] - 2026-06-30
### Added
- **Convertisseur Pro — ProRes** : nouvelle cible de sortie ProRes 422 HQ (.mov), l'intermédiaire idéal pour After Effects / Premiere / Resolve.
- **Téléchargements — Forcer H.264** : nouvelle option dans les réglages qui force une piste H.264/AAC (évite le VP9/AV1 servi par YouTube en 4K+, refusé par les logiciels de montage).
- **Moteur JS (Deno)** : installation en un clic depuis Paramètres → Avancé, pour une extraction YouTube complète (supprime l'avertissement « no supported JavaScript runtime »).
- **Glisser-déposer unifié** : composant `DropZone` partagé — design cohérent, retour visuel à l'accent, gestion du survol fiabilisée sur tous les outils.

### Fixed
- **Drop = IA** : déposer un fichier sur un outil le charge désormais dans cet outil au lieu d'ouvrir l'assistant IA (les zones portent `data-orbit-dropzone`, ignorées par le handler global).
- **Cookies navigateur** : réessai automatique sans cookies quand la base est verrouillée (Chrome/Edge ouvert) ou introuvable — plus de plantage en code 1 sur les vidéos publiques.
- **prompt() non supporté** : remplacement du `prompt()` natif (qui plantait l'onglet sous Electron) par une modale interne, dans les 5 composants concernés.
- **After Effects** : la conversion vidéo (mp4/mov) produit un H.264 yuv420p réellement importable.

### Internal
- Nettoyage : suppression de ~22 imports/variables inutilisés et de 13 clés de traduction en double.

## [0.7.1] - 2026-06-08
### Fixed
- **Convertisseur** : Correction d'un problème qui empêchait la conversion si le moteur FFmpeg n'était pas mis à jour manuellement par l'utilisateur. Orbit utilise désormais son moteur interne par défaut.

## [0.7.0] - 2026-06-08
### Fixed
- **Convertisseur** : Correction du dossier d'enregistrement par défaut. Si aucun dossier n'est configuré dans les paramètres, le fichier converti est désormais automatiquement enregistré dans le même dossier que le fichier source original, au lieu d'essayer d'écrire dans la racine protégée de `C:\`.

## [0.6.9] - 2026-06-08
### Added
- **Sniffer (Patreon/Mux)** : Refonte majeure du système de détection vidéo. Le Sniffer filtre désormais toutes les "renditions" secondaires (fichiers `.ts`, `rendition.m3u8`, audio) pour ne garder que le flux maître.
- **Dédoublonnage UI** : Fin de l'affichage multiple pour la même vidéo Patreon. Vous n'aurez plus qu'un seul téléchargement propre.
- **Remuxing MP4** : Lors de l'utilisation de flux `.m3u8`, yt-dlp assemble désormais automatiquement tous les flux téléchargés dans un seul fichier final `.mp4`.

## [0.6.8] - 2026-06-08
### Added
- **Panneau de Logs Amélioré** : Capture des erreurs internes du processus enfant (crash d'exécution) et affichage des messages d'erreur critiques (STDERR) directement dans le panneau de logs rouge du frontend, même si le téléchargement est rejeté avant le démarrage.

## [0.6.6] - 2026-06-08
### Fixed
- **Plantages de Rejet (UnhandledRejection)** : Capture silencieuse de l'erreur système lors d'un échec violent de `yt-dlp`.
- **Cookies Chrome Exclusifs** : Si le Sniffer fournit déjà des cookies de session pour une vidéo protégée (ex: Patreon), l'argument `--cookies-from-browser` est désactivé pour éviter que yt-dlp ne plante en cherchant la base de données Chrome.

## [0.6.5] - 2026-06-08
### Added
- **Persistance des Logs** : Le panneau des logs se souvient désormais des anciens logs même lorsque vous fermez l'onglet.
- **Bouton d'Erreur UI** : Apparition du bouton rouge "Erreur — Voir logs" sous la vidéo lorsqu'un téléchargement échoue.

## Versions antérieures
*Les notes de version antérieures à 0.6.5 ne sont pas documentées ici.*
