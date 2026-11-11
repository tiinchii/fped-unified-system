# Deployment sa Ubuntu server

Ayos: **Nginx** (443, HTTPS) ang nasa harap. Inihahatid nito ang React app at ipinapasa ang `/api` sa **Spring Boot**
(127.0.0.1:8080), na siyang kumakausap sa **MariaDB**. Hindi bukas sa labas ang 8080 at 3306.

Ang mga sample file ay nasa `deploy/`.

## Unang setup (isang beses)

1. **Java, Nginx**

   ```bash
   sudo apt install openjdk-21-jre-headless nginx
   ```

2. **Database** (palitan ang password)

   ```sql
   CREATE DATABASE fped_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'fped_portal'@'localhost' IDENTIFIED BY 'mahabang-password';
   GRANT ALL ON fped_portal.* TO 'fped_portal'@'localhost';
   ```

3. **User at folders ng app**

   ```bash
   sudo useradd --system --home /opt/fped-portal --shell /usr/sbin/nologin fped
   sudo mkdir -p /opt/fped-portal /etc/fped-portal /var/www/fped-portal
   sudo cp deploy/fped-portal.env.example /etc/fped-portal/fped-portal.env
   sudo chmod 600 /etc/fped-portal/fped-portal.env
   sudo nano /etc/fped-portal/fped-portal.env
   ```

   Ilagay ang totoong `DB_PASSWORD`.

4. **Service**

   ```bash
   sudo cp deploy/fped-portal.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable fped-portal
   ```

5. **Nginx.** Kopyahin ang `deploy/nginx-fped-portal.conf` sa `/etc/nginx/sites-available/fped-portal`, palitan ang
   `planning.example.gov.ph` at ang path ng certificate, tapos:

   ```bash
   sudo ln -s /etc/nginx/sites-available/fped-portal /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **Firewall:** 80 at 443 lang ang bukas.

   ```bash
   sudo ufw allow 80,443/tcp
   ```

7. **Backup gabi-gabi**

   ```bash
   sudo install -m 750 deploy/backup.sh /usr/local/bin/fped-portal-backup
   sudo crontab -e
   ```

   Idagdag ang linyang `15 1 * * * /usr/local/bin/fped-portal-backup`. Kopyahin din ang `/var/backups/fped-portal`
   sa labas ng server.

## Bawat bagong bersyon

Sa computer na may code:

```bash
cd backend && ./mvnw clean package
cd ../frontend && npm ci && npm run build
```

Kopyahin sa server ang `backend/target/fped-unified-system.jar` at ang laman ng `frontend/dist/`, tapos sa server:

```bash
sudo cp fped-unified-system.jar /opt/fped-portal/
sudo rsync -a --delete dist/ /var/www/fped-portal/
sudo systemctl restart fped-portal
sudo journalctl -u fped-portal -n 50
```

Kusang ina-apply ng Flyway ang mga bagong migration sa pag-start. **Mag-backup muna** bago mag-deploy ng bersyong
may bagong migration.

Paalala: nasa memory ng app ang mga login, kaya pagka-restart ay kailangang mag-login ulit ang lahat.

## Mga user

**Paraan A – i-import ang logins ng Travel Order System (inirerekomenda).** Sa Google Sheet ng Travel Order System,
buksan ang `Users` sheet (i-unhide ang columns na Salt at Password Hash), **File → Download → Comma-separated
values**, kopyahin sa server, tapos:

```bash
sudo bash -c 'set -a; . /etc/fped-portal/fped-portal.env; exec runuser -u fped -- java -jar /opt/fped-portal/fped-unified-system.jar --import-users=/tmp/Users.csv'
```

```bash
rm /tmp/Users.csv
```

Hindi kailangang ihinto ang app habang nag-i-import.

Pareho pa rin ang username at password ng lahat. Ligtas ulitin: ang mga username na nandoon na ay hindi ginagalaw.
Burahin ang CSV pagkatapos, dahil may password hashes ito.

**Paraan B – bagong Admin.** Ilagay ang `APP_BOOTSTRAP_ADMIN_PASSWORD` sa env file at i-restart. Gagawa ito ng user
na `admin` kung wala pang kahit isang user. Tanggalin ang linya pagkatapos.

## Pag-restore ng backup

```bash
sudo systemctl stop fped-portal
zcat /var/backups/fped-portal/fped_portal-YYYY-MM-DD_HHMM.sql.gz | sudo mariadb
sudo systemctl start fped-portal
```
