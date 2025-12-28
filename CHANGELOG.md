# Changelog

All notable changes to this project will be documented in this file.

## [0.1.7] - 2025-12-28

### <!-- 0 -->🚀 Features

- *(ui)* Show analysis panel by default ([fa82ea3](https://github.com/kaya-go/kaya/commit/fa82ea3704b5c20edd3d766c823a36ff14a76b16))

### <!-- 1 -->🐛 Bug Fixes

- *(ui)* Fix light mode styling for various UI components ([c3984a5](https://github.com/kaya-go/kaya/commit/c3984a5fec08ee07c5d50687af82e7de5c0ec935))

- Edit toolbar layout and scroll behavior at 1440px width ([725eff9](https://github.com/kaya-go/kaya/commit/725eff9d50b4318a45610e62ae113990ac895528))

- *(ui)* Add padding to win rate y-axis limits in analysis chart ([95f2775](https://github.com/kaya-go/kaya/commit/95f277547664fd85b1fa0da2d6259c45611df4eb))

- *(ui)* Increase bottom padding for x-axis labels in analysis chart ([3b0228f](https://github.com/kaya-go/kaya/commit/3b0228fda4d28db1c30a225bc3545e6c1a913959))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Add CLA assistant workflow and contributor license agreement ([50dee15](https://github.com/kaya-go/kaya/commit/50dee152e2e0fe778eb55c3bc73723e637f910c3))

## [0.1.6] - 2025-12-27

### <!-- 0 -->🚀 Features

- *(desktop)* Improve updater UI with dev mode testing and better styling ([644f04e](https://github.com/kaya-go/kaya/commit/644f04e6031b1807c6698cce48a8bbe3eeedfbfc))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.6 ([075b95d](https://github.com/kaya-go/kaya/commit/075b95d7c801f7003d0ffe25077389411fa51ef1))

## [0.1.5] - 2025-12-27

### <!-- 0 -->🚀 Features

- *(ai)* Hierarchical model selector with quantization options ([38ca0ed](https://github.com/kaya-go/kaya/commit/38ca0ed2a3797889c8d8f87b3273b9a4349449cd))

- *(ai)* Add smart backend fallback with settings persistence ([57c4c8c](https://github.com/kaya-go/kaya/commit/57c4c8ce422a9dd2c2c4e4f80f718c233322b0f7))

### <!-- 1 -->🐛 Bug Fixes

- Delete cached model from tauri filesystem when model is deleted ([829f7cc](https://github.com/kaya-go/kaya/commit/829f7ccf9c749c75f52e01cae57364ac3c5e99bb))

### <!-- 2 -->🚜 Refactor

- *(ai)* Simplify model definitions with url generation helper ([dc3743c](https://github.com/kaya-go/kaya/commit/dc3743c0f8b0aa331fee29a896e7b3f19bcfe0aa))

- *(ai)* Improve expand/collapse handling in AIAnalysisConfig ([fd258c6](https://github.com/kaya-go/kaya/commit/fd258c6d5029d568cdb39392a557f59014769d91))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.5 ([61b078f](https://github.com/kaya-go/kaya/commit/61b078f8e401b3f82ce4fe5ec9a3e30ce00f87ee))

## [0.1.4] - 2025-12-27

### <!-- 0 -->🚀 Features

- *(ai)* Pin katago models to specific hugging face commit hash ([47ff9bc](https://github.com/kaya-go/kaya/commit/47ff9bc144d68bd083e01f3df52c4e1f7bc6fc30))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.4 ([9e7fb1d](https://github.com/kaya-go/kaya/commit/9e7fb1d2adbf4643897d5b8c33189ba8cc854fa6))

## [0.1.3] - 2025-12-16

### <!-- 0 -->🚀 Features

- *(ui)* Create new game on paste with game name as filename ([8be79df](https://github.com/kaya-go/kaya/commit/8be79df1cbec73d609142bfe0faeacbb346d9ff8))

### <!-- 1 -->🐛 Bug Fixes

- *(desktop)* Use tauri clipboard plugin to avoid paste permission popup ([15de470](https://github.com/kaya-go/kaya/commit/15de4709ef802f3e81c1cb6eea311a0c497ccccf))

- Preserve analysis cache when loading SGF with embedded analysis ([9af0088](https://github.com/kaya-go/kaya/commit/9af0088874345c2492d7a92969a33936d59afd19))

- *(ai-engine)* Always display black win rate in analysis bar ([1bff38f](https://github.com/kaya-go/kaya/commit/1bff38f8ce7317f1ce670605960e7bce1ed783a7))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.3 ([6376203](https://github.com/kaya-go/kaya/commit/63762035e74558f656e79731f9fb48af49340484))

## [0.1.2] - 2025-12-14

### <!-- 0 -->🚀 Features

- Migrate model hosting from GitHub to Hugging Face ([13fa7e7](https://github.com/kaya-go/kaya/commit/13fa7e731b747462b15c9c91ae4ee467baff3077))

- *(ai)* Add latest KataGo model and improve model library UX ([c1cf500](https://github.com/kaya-go/kaya/commit/c1cf5005709893f1b23c583b327baea8e237b678))

- *(ai)* Add recommended and default badges to first model ([6d8d935](https://github.com/kaya-go/kaya/commit/6d8d935d38839318f7da514dc9c369ec8be6bab1))

### <!-- 2 -->🚜 Refactor

- *(ai)* Use neutral model descriptions with 4 variants ([ed3f591](https://github.com/kaya-go/kaya/commit/ed3f591dfecbb2b4baf778f3b1743afefa3848d7))

- *(ai)* Format recommended badge rendering and improve default model selection logic ([a818916](https://github.com/kaya-go/kaya/commit/a8189161d72d3f982a1505fc45a3f0ce396d5cd7))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.2 ([c44393b](https://github.com/kaya-go/kaya/commit/c44393b85ecc337627bfa9cf3c7eb41615f65eb3))

## [0.1.1] - 2025-12-13

### <!-- 0 -->🚀 Features

- *(desktop)* Add landing page and home button for mobile/tablet layout ([83a76f3](https://github.com/kaya-go/kaya/commit/83a76f35f6e00d3ced09593cd5426a56069dbf39))

### <!-- 1 -->🐛 Bug Fixes

- *(i18n)* Wait for translations to load before showing updater text ([2c19515](https://github.com/kaya-go/kaya/commit/2c195158dfdef000a0169fe746e23ca4bd284ceb))

- *(i18n)* Add missing translation keys for landing, editToolbar, and scoring ([e5bb31f](https://github.com/kaya-go/kaya/commit/e5bb31fe2e70f1ce8e61a3f76cb71edf28c45d12))

- Landing page library button now opens library tab on mobile ([376a415](https://github.com/kaya-go/kaya/commit/376a415354d996892d3f6ce6ae11f597ee8caa94))

- *(i18n)* Rename 'Configuration IA' to 'Configuration de l'analyse' in french ([d14e04c](https://github.com/kaya-go/kaya/commit/d14e04c18857c1b475b22c00de3731d3d6e1f3c9))

### <!-- 3 -->📚 Documentation

- Add screenshot to readme ([befd978](https://github.com/kaya-go/kaya/commit/befd978b112d5a92cf9cb6317bb29e7a20573979))

- Add multi-language and mobile/tablet support to features ([de4d3ac](https://github.com/kaya-go/kaya/commit/de4d3ac98a737c0d091c4f4831f1edc60ac0a401))

- Add release badge and tech stack badges with logos ([4f0f7a5](https://github.com/kaya-go/kaya/commit/4f0f7a5b8c1ce772eb158047c417d1f23c468a99))

- Replace text links with styled action buttons ([e3fdb65](https://github.com/kaya-go/kaya/commit/e3fdb65db6736eccd6c63289660ce6c72b022376))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.1 ([3eb79dd](https://github.com/kaya-go/kaya/commit/3eb79ddd1b082ebbd114dcfe11bcb6f69e71cb24))

## [0.1.0] - 2025-12-13

### <!-- 1 -->🐛 Bug Fixes

- Disable debug info stripping for release builds ([635fd32](https://github.com/kaya-go/kaya/commit/635fd3253415765a4b6bc0b88ffe0daa1ad7a8fc))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Initial commit ([97a2457](https://github.com/kaya-go/kaya/commit/97a245746ac87df64284a9d6e31c35b3e3f0ba5e))

- Release v0.1.0 ([aacf98c](https://github.com/kaya-go/kaya/commit/aacf98cccb32cf78f2557fd51de6ee0f90fd0bd0))

<!-- generated by git-cliff -->
