# Development sa Windows (sariling computer)

Lahat ng command dito ay para sa **PowerShell**, sa loob ng folder ng project. Walang `sudo` at walang kailangang
server. (Ang `docs/DEPLOY.md` ay para sa Ubuntu server at saka na iyon.)

## Kailangan

| Ano | Paano i-check sa PowerShell |
|---|---|
| Java 21 (JDK), at naka-set ang `JAVA_HOME` | `java -version` at `echo $env:JAVA_HOME` |
| Node 22 o mas bago | `node -v` |
| MySQL 8 o MariaDB 10.11 | bukas ang database server |

Hindi kailangang naka-install ang Maven: gamitin ang `.\mvnw.cmd` sa loob ng `backend\`.

## 1. Database (isang beses lang)

Sa database client (MySQL Workbench, HeidiSQL, DBeaver, o `mysql` command line), **hindi sa PowerShell**:

```sql
CREATE DATABASE fped_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fped_portal'@'localhost' IDENTIFIED BY 'pumili-ng-password';
GRANT ALL ON fped_portal.* TO 'fped_portal'@'localhost';
```

Hindi kailangang gumawa ng tables. Ang Flyway ang gumagawa nito sa unang takbo ng backend
(`backend\src\main\resources\db\migration`).

## 2. Backend (unang PowerShell window)

```powershell
cd backend
```

```powershell
$env:DB_PASSWORD = "pumili-ng-password"
```

**Kung MySQL 8 ang database** (hindi MariaDB), kailangan din ito. Kung wala, lalabas ang error na
`RSA public key is not available client side`:

```powershell
$env:DB_URL = "jdbc:mariadb://localhost:3306/fped_portal?allowPublicKeyRetrieval=true"
```

Sa **pinakaunang takbo lang**, habang wala pang user, para magawa ang user na `admin`:

```powershell
$env:APP_BOOTSTRAP_ADMIN_PASSWORD = "pumili-ng-admin-password"
```

```powershell
$env:SPRING_PROFILES_ACTIVE = "dev"
```

```powershell
.\mvnw.cmd spring-boot:run
```

- Handa na kapag lumabas ang `Started PortalApplication`. Nasa `http://127.0.0.1:8080` ito.
- Ang mga `$env:` ay para lang sa PowerShell window na iyon. Sa bagong window, i-set ulit.
- Tama ang `jdbc:mariadb://` kahit MySQL ang database: iisang driver ang gamit sa dalawa.
- Para ihinto: `Ctrl + C`.

## 3. Frontend (pangalawang PowerShell window)

```powershell
cd frontend
```

```powershell
npm install
```

```powershell
npm run dev
```

Buksan ang `http://localhost:5173` at mag-login bilang `admin` gamit ang admin password na pinili mo.
Ipinapasa ng Vite ang `/api` sa backend, kaya dapat tumatakbo ang dalawa.

## Kapag may binago sa API ng backend

Habang tumatakbo ang backend sa `dev` profile, sa folder na `frontend`:

```powershell
npm run gen:api
```

Ina-update nito ang `frontend\src\api\schema.d.ts`. Kung may hindi na tugma sa React code, lalabas bilang error sa:

```powershell
npm run typecheck
```

I-commit ang `schema.d.ts` kasama ng pagbabago.

## Tests

Sa folder na `backend`:

```powershell
.\mvnw.cmd test
```

Tumatakbo ang tests sa H2 (in-memory database), kaya hindi kailangang bukas ang MySQL.

Sa folder na `frontend` (kasama na ang type check):

```powershell
npm run build
```

## Para subukan ang import ng users mula sa Google Sheet

Sa Google Sheet ng Travel Order System, buksan ang `Users` sheet (i-unhide ang columns na Salt at Password Hash),
**File → Download → Comma-separated values**. Ihinto muna ang backend (`Ctrl + C`), tapos sa folder na `backend`,
sa parehong window kung saan naka-set ang `$env:DB_PASSWORD`:

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--import-users=C:\Users\ikaw\Downloads\Users.csv"
```

Pareho pa rin ang username at password ng lahat. Ligtas ulitin: ang mga username na nandoon na ay hindi ginagalaw.
Burahin ang CSV pagkatapos, dahil may password hashes ito, at huwag itong ilagay sa loob ng project folder.

## Mga patakaran sa code

- **Schema:** bawat pagbabago sa tables ay bagong file sa `db\migration` (`V2__...sql`, `V3__...sql`). Huwag i-edit ang
  migration na na-apply na.
- **Sikreto:** walang password, token o client secret sa repo. Environment variables lang.
- **Roles:** ang tunay na check ay nasa backend (`SecurityConfig`, `/api/admin/**`). Ang pagtatago ng menu sa React ay
  para sa ginhawa lang ng user.
- **Audit log:** bawat pagbabago ng data ay tumatawag sa `AuditService.log(...)` sa loob ng parehong transaction.
- **Oras:** UTC sa database; Manila time sa screen (`frontend\src\format.ts`).

## Saan na-test

Sa Linux na-test ang system (MariaDB 10.11 at MySQL 8.0). Hindi pa napapatakbo sa Windows mismo, kaya kung may
command dito na hindi gumana sa PowerShell, iyon ang unang titingnan.
