# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-05

### Added

- New `Octet` utility for parsing IP Addresses and CIDRs.
- New `Bloom` Utility for static and growable bloom filters.

### Changed

- Moved dependencies to peer dependencies.
- Bumped dependency versions

## [3.0.1] - 2026-04

### Added

- Exported config layer classes and functions for KeyVault and Azure FS.

## [3.0.0] - 2026-03

### Added

- New Azure FS Service.

### Fixed

- Schemas for Legl and iManage are now exported.
- Key Vault backed ConfigProvider now works as intended.
- Effect is now included in `devDependencies` as well as `peerDependencies`

### Changed

- All Effect code now uses Effect 4.0.0-beta.
- Sourcemap now gets inlined in build (previously no sourcemap was generated).
- Target build is now Bun (was previously Node).
- As part of Effect 4.0, all layers can now be constructed via `.layer` methods on the service.
- Sensitive values can now be passed as `Redacted<string>` or `string`. Was previously a mix of both.
- imanage `uploadFile` function now takes in a `Buffer` instead of an `ArrayBuffer` for greater flexability.

### Removed


