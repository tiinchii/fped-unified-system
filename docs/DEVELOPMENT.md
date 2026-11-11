# Development (sa sariling computer)

## Kailangan

- Java 21
- Node 22 (o mas bago) at npm
- MariaDB 10.11 (gamitin ang MariaDB, hindi MySQL, para kapareho ng server)

Hindi kailangang naka-install ang Maven: gamitin ang `./mvnw` sa loob ng `backend/`.

## 1. Database (isang beses lang)

```sql
CREATE DATABASE fped_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fped_portal'@'localhost' IDENTIFIED BY 'pumili-ng-password';
GRANT ALL ON fped_portal.* TO 'fped_portal'@'localhost';
```

Hindi kailangang gumawa ng tables. Ang Flyway ang gumagawa nito sa unang takbo ng backend
(`backend/src/main/resources/db/migration`).

## 2. Backend

```bash
cd backend
DB_PASSWORD=pumili-ng-password APP_BOOTSTRAP_ADMIN_PASSWORD=pumili-ng-admin-password SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

- Bubukas sa `http://127.0.0.1:8080`.
- Ang `APP_BOOTSTRAP_ADMIN_PASSWORD` ay para lang sa unang takbo, habang wala pang user: gagawa ito ng `admin`.
- Sa `dev` profile, nasa `http://127.0.0.1:8080/v3/api-docs` ang paglalarawan ng API.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Buksan ang `http://localhost:5173`. Ipinapasa ng Vite ang `/api` sa backend.

## Kapag may binago sa API ng backend

Habang tumatakbo ang backend sa `dev` profile:

```bash
cd frontend
npm run gen:api
```

Ina-update nito ang `frontend/src/api/schema.d.ts`. Kung may hindi na tugma sa React code, lalabas bilang error sa
`npm run typecheck`. I-commit ang `schema.d.ts` kasama ng pagbabago.

## Tests

```bash
cd backend
./mvnw test
```

Tumatakbo ang tests sa H2 (in-memory, MariaDB mode), kaya walang kailangang naka-install na database.

```bash
cd frontend
npm run build
```

Kasama sa build ang type check.

## Mga patakaran sa code

- **Schema:** bawat pagbabago sa tables ay bagong file sa `db/migration` (`V2__...sql`, `V3__...sql`). Huwag i-edit ang
  migration na na-apply na sa server.
- **Sikreto:** walang password, token o client secret sa repo. Environment variables lang.
- **Roles:** ang tunay na check ay nasa backend (`SecurityConfig`, `/api/admin/**`). Ang pagtatago ng menu sa React ay
  para sa ginhawa lang ng user.
- **Audit log:** bawat pagbabago ng data ay tumatawag sa `AuditService.log(...)` sa loob ng parehong transaction.
- **Oras:** UTC sa database; Manila time sa screen (`frontend/src/format.ts`).
