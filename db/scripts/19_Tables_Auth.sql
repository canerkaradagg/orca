-- ============================================================
-- ORCA – Authentication & Authorization tabloları
-- Users, Roles, UserRoles, Screens, RoleScreenPermissions
-- ============================================================

USE [OrcaAlokasyon]
GO

-- ==================== USERS ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Users' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.Users (
    UserId        INT            IDENTITY(1,1) NOT NULL,
    Email         NVARCHAR(200)  NOT NULL,
    DisplayName   NVARCHAR(100)  NOT NULL,
    PasswordHash  NVARCHAR(500)  NOT NULL,
    IsExternal    BIT            NOT NULL DEFAULT 0,
    IsActive      BIT            NOT NULL DEFAULT 1,
    CreatedAt     DATETIME       NOT NULL DEFAULT GETDATE(),
    LastLoginAt   DATETIME       NULL,
    CONSTRAINT PK_Users PRIMARY KEY CLUSTERED (UserId),
    CONSTRAINT UQ_Users_Email UNIQUE (Email)
);
GO

-- ==================== ROLES ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Roles' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.Roles (
    RoleId      INT            IDENTITY(1,1) NOT NULL,
    RoleName    NVARCHAR(50)   NOT NULL,
    Description NVARCHAR(200)  NULL,
    IsActive    BIT            NOT NULL DEFAULT 1,
    CONSTRAINT PK_Roles PRIMARY KEY CLUSTERED (RoleId),
    CONSTRAINT UQ_Roles_Name UNIQUE (RoleName)
);
GO

-- ==================== USER ROLES ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'UserRoles' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.UserRoles (
    UserId INT NOT NULL,
    RoleId INT NOT NULL,
    CONSTRAINT PK_UserRoles PRIMARY KEY CLUSTERED (UserId, RoleId),
    CONSTRAINT FK_UserRoles_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_UserRoles_Role FOREIGN KEY (RoleId) REFERENCES dbo.Roles(RoleId)
);
GO

-- ==================== SCREENS ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Screens' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.Screens (
    ScreenId    INT            IDENTITY(1,1) NOT NULL,
    ScreenCode  NVARCHAR(50)   NOT NULL,
    ScreenName  NVARCHAR(100)  NOT NULL,
    ParentCode  NVARCHAR(50)   NULL,
    SortOrder   INT            NOT NULL DEFAULT 0,
    CONSTRAINT PK_Screens PRIMARY KEY CLUSTERED (ScreenId),
    CONSTRAINT UQ_Screens_Code UNIQUE (ScreenCode)
);
GO

-- ==================== ROLE SCREEN PERMISSIONS ====================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RoleScreenPermissions' AND schema_id = SCHEMA_ID('dbo'))
CREATE TABLE dbo.RoleScreenPermissions (
    RoleId    INT NOT NULL,
    ScreenId  INT NOT NULL,
    CanView   BIT NOT NULL DEFAULT 0,
    CanEdit   BIT NOT NULL DEFAULT 0,
    CanDelete BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_RoleScreenPerms PRIMARY KEY CLUSTERED (RoleId, ScreenId),
    CONSTRAINT FK_RoleScreenPerms_Role   FOREIGN KEY (RoleId)   REFERENCES dbo.Roles(RoleId),
    CONSTRAINT FK_RoleScreenPerms_Screen FOREIGN KEY (ScreenId) REFERENCES dbo.Screens(ScreenId)
);
GO

-- ==================== SEED: Screens ====================
IF NOT EXISTS (SELECT 1 FROM dbo.Screens)
BEGIN
    INSERT INTO dbo.Screens (ScreenCode, ScreenName, ParentCode, SortOrder) VALUES
     (N'asn-dosya-yukle',       N'ASN Dosya Yükle',          N'asn-islemleri',  10)
    ,(N'asn-listele',           N'ASN Listele',              N'asn-islemleri',  20)
    ,(N'finans-onay',           N'Finans Onay',              N'finans',         30)
    ,(N'ceki-listesi-olustur',  N'Çeki Listesi Oluştur',     N'finans',         40)
    ,(N'ceki-listesi',          N'Çeki Listesi',             N'finans',         50)
    ,(N'sevk-emri-raporu',      N'Sevk Emri Süreç Raporu',   N'raporlar',       60)
    ,(N'parametreler',          N'Parametreler',             N'ayarlar',        70)
    ,(N'admin-roller',          N'Roller',                   N'yonetim',        80)
    ,(N'admin-kullanicilar',    N'Kullanıcılar',             N'yonetim',        90)
END
GO

-- ==================== SEED: Admin Role ====================
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleName = N'Admin')
    INSERT INTO dbo.Roles (RoleName, Description) VALUES (N'Admin', N'Tüm ekranlara tam yetki');
GO

-- Admin rolüne tüm ekranlar için tam yetki
INSERT INTO dbo.RoleScreenPermissions (RoleId, ScreenId, CanView, CanEdit, CanDelete)
SELECT r.RoleId, s.ScreenId, 1, 1, 1
  FROM dbo.Roles r
  CROSS JOIN dbo.Screens s
 WHERE r.RoleName = N'Admin'
   AND NOT EXISTS (SELECT 1 FROM dbo.RoleScreenPermissions rsp
                    WHERE rsp.RoleId = r.RoleId AND rsp.ScreenId = s.ScreenId);
GO

-- ==================== SEED: Default admin user (şifre: Admin123!) ====================
-- bcrypt hash for 'Admin123!' - bu hash Node.js tarafında bcrypt ile üretilmiş olmalı
-- Geçici olarak SHA256 hash kullanıyoruz; ilk login'de bcrypt'e geçirilecek
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Email = N'admin@olka.com.tr')
    INSERT INTO dbo.Users (Email, DisplayName, PasswordHash, IsExternal, IsActive)
    VALUES (N'admin@olka.com.tr', N'Sistem Yöneticisi', N'$INITIAL$', 0, 1);
GO

-- Admin kullanıcısına Admin rolü ata
INSERT INTO dbo.UserRoles (UserId, RoleId)
SELECT u.UserId, r.RoleId
  FROM dbo.Users u
  CROSS JOIN dbo.Roles r
 WHERE u.Email = N'admin@olka.com.tr'
   AND r.RoleName = N'Admin'
   AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur
                    WHERE ur.UserId = u.UserId AND ur.RoleId = r.RoleId);
GO

-- ==================== INDEX'ler ====================
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UserRoles_RoleId' AND object_id = OBJECT_ID('dbo.UserRoles'))
    CREATE NONCLUSTERED INDEX IX_UserRoles_RoleId ON dbo.UserRoles (RoleId) INCLUDE (UserId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RoleScreenPerms_ScreenId' AND object_id = OBJECT_ID('dbo.RoleScreenPermissions'))
    CREATE NONCLUSTERED INDEX IX_RoleScreenPerms_ScreenId ON dbo.RoleScreenPermissions (ScreenId) INCLUDE (RoleId, CanView, CanEdit, CanDelete);
GO

PRINT 'Auth tabloları ve seed data oluşturuldu.';
GO
