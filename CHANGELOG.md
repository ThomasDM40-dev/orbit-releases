# Changelog Orbit

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
