-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: v_o_c_e
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `category_overrides`
--

-- Cria o banco de dados se ainda não existir
CREATE DATABASE IF NOT EXISTS 'v_o_c_e' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- Seleciona o banco para usar
USE 'v_o_c_e';

DROP TABLE IF EXISTS `category_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `category_overrides` (
  `hostname` varchar(255) NOT NULL COMMENT 'Hostname (ex: gemini.google.com) em minúsculas',
  `category` varchar(100) NOT NULL COMMENT 'A categoria definida manualmente',
  `updated_by_professor_id` int(11) DEFAULT NULL COMMENT 'ID do professor que fez a última alteração (opcional)',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Quando a regra foi atualizada',
  PRIMARY KEY (`hostname`),
  KEY `updated_by_professor_id` (`updated_by_professor_id`),
  CONSTRAINT `category_overrides_ibfk_1` FOREIGN KEY (`updated_by_professor_id`) REFERENCES `professors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Armazena substituições manuais de categorias para hostnames específicos.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `category_overrides`
--

LOCK TABLES `category_overrides` WRITE;
/*!40000 ALTER TABLE `category_overrides` DISABLE KEYS */;
/*!40000 ALTER TABLE `category_overrides` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_members`
--

DROP TABLE IF EXISTS `class_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `class_members` (
  `class_id` int(11) NOT NULL,
  `professor_id` int(11) NOT NULL,
  PRIMARY KEY (`class_id`,`professor_id`),
  KEY `professor_id` (`professor_id`),
  CONSTRAINT `class_members_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `class_members_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_members`
--

LOCK TABLES `class_members` WRITE;
/*!40000 ALTER TABLE `class_members` DISABLE KEYS */;
INSERT INTO `class_members` VALUES (1,2),(2,1);
/*!40000 ALTER TABLE `class_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_students`
--

DROP TABLE IF EXISTS `class_students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `class_students` (
  `class_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  PRIMARY KEY (`class_id`,`student_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `class_students_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `class_students_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_students`
--

LOCK TABLES `class_students` WRITE;
/*!40000 ALTER TABLE `class_students` DISABLE KEYS */;
INSERT INTO `class_students` VALUES (2,1),(2,2),(2,3);
/*!40000 ALTER TABLE `class_students` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `classes`
--

DROP TABLE IF EXISTS `classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `classes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `owner_id` int(11) NOT NULL COMMENT 'ID do professor que criou a turma',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `classes_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `classes`
--

LOCK TABLES `classes` WRITE;
/*!40000 ALTER TABLE `classes` DISABLE KEYS */;
INSERT INTO `classes` VALUES (1,'DEV2B',2,'2025-10-17 19:46:01'),(2,'DEV_B',1,'2025-10-17 19:46:01');
/*!40000 ALTER TABLE `classes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `logs`
--

DROP TABLE IF EXISTS `logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aluno_id` varchar(255) NOT NULL COMMENT 'Pode ser o CPF ou o PC_ID do aluno',
  `url` text NOT NULL,
  `duration` int(11) NOT NULL COMMENT 'Duração em segundos',
  `categoria` varchar(100) DEFAULT NULL,
  `timestamp` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB AUTO_INCREMENT=165 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `logs`
--

LOCK TABLES `logs` WRITE;
/*!40000 ALTER TABLE `logs` DISABLE KEYS */;
INSERT INTO `logs` VALUES (1,'49418787873','gemini.google.com',12,'IA','2025-10-22 08:35:17'),(2,'49418787873','gemini.google.com',380,'IA','2025-10-22 08:42:54'),(3,'49418787873','drive.google.com',13,'Produtividade & Ferramentas','2025-10-22 08:43:29'),(4,'49418787873','drive.google.com',409,'Produtividade & Ferramentas','2025-10-22 08:50:33'),(5,'49418787873','github.com',74,'Produtividade & Ferramentas','2025-10-22 08:52:31'),(6,'49418787873','github.com',6,'Produtividade & Ferramentas','2025-10-22 08:52:37'),(7,'49418787873','github.com',8,'Produtividade & Ferramentas','2025-10-22 08:52:48'),(8,'49418787873','github.com',89,'Produtividade & Ferramentas','2025-10-22 08:54:21'),(9,'49418787873','reporemover.xyz',12,'Outros','2025-10-22 08:54:47'),(10,'49418787873','github.com',12,'Produtividade & Ferramentas','2025-10-22 08:54:58'),(11,'49418787873','reporemover.xyz',36,'Outros','2025-10-22 08:55:37'),(12,'49418787873','github.com',8,'Produtividade & Ferramentas','2025-10-22 08:55:46'),(13,'49418787873','github.com',19,'Produtividade & Ferramentas','2025-10-22 08:56:05'),(14,'49418787873','github.com',7,'Produtividade & Ferramentas','2025-10-22 08:56:12'),(15,'49418787873','github.com',9,'Produtividade & Ferramentas','2025-10-22 08:56:30'),(16,'49418787873','mind-class-ai-64.vercel.app',11,'Outros','2025-10-22 08:56:53'),(17,'49418787873','github.com',7,'Produtividade & Ferramentas','2025-10-22 08:57:04'),(18,'49418787873','reporemover.xyz',10,'Outros','2025-10-22 08:57:33'),(19,'49418787873','github.com',8,'Produtividade & Ferramentas','2025-10-22 08:57:46'),(20,'49418787873','github.com',11,'Produtividade & Ferramentas','2025-10-22 08:58:35'),(21,'49418787873','github.com',6,'Produtividade & Ferramentas','2025-10-22 08:58:41'),(22,'49418787873','github.com',6,'Produtividade & Ferramentas','2025-10-22 08:58:47'),(23,'49418787873','github.com',15,'Produtividade & Ferramentas','2025-10-22 08:59:05'),(24,'49418787873','github.com',9,'Produtividade & Ferramentas','2025-10-22 08:59:18'),(25,'49418787873','github.com',6,'Produtividade & Ferramentas','2025-10-22 08:59:26'),(26,'49418787873','github.com',17,'Produtividade & Ferramentas','2025-10-22 08:59:54'),(27,'49418787873','drive.google.com',125,'Produtividade & Ferramentas','2025-10-22 09:02:09'),(28,'49418787873','drive.google.com',21,'Produtividade & Ferramentas','2025-10-22 09:02:29'),(29,'49418787873','drive.google.com',155,'Produtividade & Ferramentas','2025-10-22 09:05:04'),(30,'49418787873','drive.google.com',214,'Produtividade & Ferramentas','2025-10-22 09:08:40'),(31,'49418787873','gemini.google.com',27,'IA','2025-10-22 09:09:11'),(32,'49418787873','gemini.google.com',7,'IA','2025-10-22 09:09:18'),(33,'49418787873','gemini.google.com',12,'IA','2025-10-22 09:09:31'),(34,'49418787873','gemini.google.com',1998,'IA','2025-10-22 09:42:57'),(35,'49418787873','gemini.google.com',170,'IA','2025-10-22 09:45:47'),(36,'49418787873','github.com',10,'Produtividade & Ferramentas','2025-10-22 09:46:01'),(37,'49418787873','github.com',71,'Produtividade & Ferramentas','2025-10-22 09:47:20'),(38,'49418787873','github.com',219,'Produtividade & Ferramentas','2025-10-22 09:50:59'),(39,'49418787873','github.com',38,'Produtividade & Ferramentas','2025-10-22 09:52:15'),(40,'49418787873','github.com',29,'Produtividade & Ferramentas','2025-10-22 09:52:44'),(41,'49418787873','github.com',6,'Produtividade & Ferramentas','2025-10-22 09:52:54'),(42,'49418787873','www.google.com',37,'Produtividade & Ferramentas','2025-10-22 09:53:40'),(43,'49418787873','www.google.com',76,'Produtividade & Ferramentas','2025-10-22 09:55:02'),(44,'49418787873','github.com',16,'Produtividade & Ferramentas','2025-10-22 09:55:18'),(45,'49418787873','github.com',10,'Produtividade & Ferramentas','2025-10-22 09:56:05'),(46,'49418787873','github.com',7,'Produtividade & Ferramentas','2025-10-22 09:56:12'),(47,'49418787873','github.com',26,'Produtividade & Ferramentas','2025-10-22 09:56:44'),(48,'49418787873','drive.google.com',19,'Produtividade & Ferramentas','2025-10-22 09:57:10'),(49,'49418787873','github.com',432,'Produtividade & Ferramentas','2025-10-22 10:04:26'),(50,'49418787873','ubuntu.com',6,'Streaming & Jogos','2025-10-22 10:04:38'),(51,'49418787873','ubuntu.com',43,'Streaming & Jogos','2025-10-22 10:05:20'),(52,'49418787873','ubuntu.com',6,'Streaming & Jogos','2025-10-22 10:05:26'),(53,'49418787873','github.com',432,'Produtividade & Ferramentas','2025-10-22 10:04:26'),(54,'49418787873','ubuntu.com',6,'Streaming & Jogos','2025-10-22 10:04:38'),(55,'49418787873','ubuntu.com',1214,'Streaming & Jogos','2025-10-22 10:25:40'),(56,'49418787873','drive.google.com',704,'Produtividade & Ferramentas','2025-10-22 10:37:24'),(57,'49418787873','gemini.google.com',19,'IA','2025-10-22 10:37:46'),(58,'49418787873','gemini.google.com',10116,'IA','2025-10-22 13:26:22'),(59,'49418787873','localhost',29,'Produtividade & Ferramentas','2025-10-22 13:26:54'),(60,'49418787873','localhost',10,'Produtividade & Ferramentas','2025-10-22 13:27:03'),(61,'49418787873','localhost',35,'Produtividade & Ferramentas','2025-10-22 13:27:42'),(62,'49418787873','localhost',6,'Produtividade & Ferramentas','2025-10-22 13:27:47'),(63,'49418787873','banco-vc.firebaseapp.com',10,'Streaming & Jogos','2025-10-22 13:28:10'),(64,'49418787873','localhost',16,'Produtividade & Ferramentas','2025-10-22 13:28:27'),(65,'49418787873','banco-vc.firebaseapp.com',11,'Streaming & Jogos','2025-10-22 13:28:43'),(66,'49418787873','localhost',42,'Produtividade & Ferramentas','2025-10-22 13:29:25'),(67,'49418787873','gemini.google.com',12,'IA','2025-10-22 13:29:40'),(68,'49418787873','gemini.google.com',21,'IA','2025-10-22 13:30:06'),(69,'49418787873','gemini.google.com',413,'IA','2025-10-22 13:37:08'),(70,'49418787873','localhost',24,'Produtividade & Ferramentas','2025-10-22 13:37:32'),(71,'49418787873','gemini.google.com',600,'IA','2025-10-22 13:47:32'),(72,'49418787873','localhost',25,'Produtividade & Ferramentas','2025-10-22 13:47:58'),(73,'49418787873','gemini.google.com',127,'IA','2025-10-22 13:50:05'),(74,'49418787873','gemini.google.com',217,'IA','2025-10-22 13:53:50'),(75,'49418787873','localhost',13,'Produtividade & Ferramentas','2025-10-22 13:54:06'),(76,'49418787873','gemini.google.com',6,'IA','2025-10-22 13:54:12'),(77,'49418787873','localhost',6,'Produtividade & Ferramentas','2025-10-22 13:54:18'),(78,'49418787873','gemini.google.com',9,'IA','2025-10-22 13:54:26'),(79,'49418787873','localhost',144,'Produtividade & Ferramentas','2025-10-22 13:56:50'),(80,'49418787873','gemini.google.com',47,'IA','2025-10-22 13:57:42'),(81,'49418787873','localhost',9,'Produtividade & Ferramentas','2025-10-22 13:57:51'),(82,'49418787873','localhost',6,'Produtividade & Ferramentas','2025-10-22 13:57:57'),(83,'49418787873','localhost',71,'Produtividade & Ferramentas','2025-10-22 13:59:08'),(84,'49418787873','localhost',9,'Produtividade & Ferramentas','2025-10-22 13:59:22'),(85,'49418787873','gemini.google.com',12,'IA','2025-10-22 13:59:35'),(86,'49418787873','github.com',54,'Produtividade & Ferramentas','2025-10-22 14:00:29'),(87,'49418787873','gemini.google.com',186,'IA','2025-10-22 14:03:35'),(88,'49418787873','localhost',12,'Produtividade & Ferramentas','2025-10-22 14:04:11'),(89,'49418787873','outlook.office.com',13,'Produtividade & Ferramentas','2025-10-22 14:04:46'),(90,'49418787873','teams.microsoft.com',8,'Produtividade & Ferramentas','2025-10-22 14:04:55'),(91,'49418787873','teams.microsoft.com',19,'Produtividade & Ferramentas','2025-10-22 14:05:15'),(92,'49418787873','mail.google.com',6,'Produtividade & Ferramentas','2025-10-22 14:05:35'),(93,'49418787873','mail.google.com',26,'Produtividade & Ferramentas','2025-10-22 14:06:03'),(94,'49418787873','mail.google.com',59,'Produtividade & Ferramentas','2025-10-22 14:07:08'),(95,'49418787873','localhost',229,'Produtividade & Ferramentas','2025-10-22 14:11:06'),(96,'49418787873','gemini.google.com',286,'IA','2025-10-22 14:15:52'),(97,'49418787873','localhost',30,'Produtividade & Ferramentas','2025-10-22 14:16:29'),(98,'49418787873','localhost',285,'Produtividade & Ferramentas','2025-10-22 14:21:14'),(99,'49418787873','gemini.google.com',145,'IA','2025-10-22 14:23:40'),(100,'49418787873','mail.google.com',131,'Produtividade & Ferramentas','2025-10-22 14:25:56'),(101,'49418787873','gemini.google.com',2844,'IA','2025-10-22 15:13:20'),(102,'49418787873','localhost',119,'Produtividade & Ferramentas','2025-10-22 15:15:37'),(103,'49418787873','drive.google.com',354,'Produtividade & Ferramentas','2025-10-22 15:21:37'),(104,'49418787873','chatgpt.com',19,'Produtividade & Ferramentas','2025-10-22 15:21:58'),(105,'49418787873','localhost',11,'Produtividade & Ferramentas','2025-10-22 15:31:58'),(106,'49418787873','localhost',8,'Produtividade & Ferramentas','2025-10-22 15:32:07'),(107,'49418787873','gemini.google.com',930,'IA','2025-10-22 15:47:37'),(108,'49418787873','localhost',48,'Produtividade & Ferramentas','2025-10-22 15:48:32'),(109,'49418787873','gemini.google.com',174,'IA','2025-10-22 15:51:26'),(110,'49418787873','localhost',29,'Produtividade & Ferramentas','2025-10-22 15:52:02'),(111,'49418787873','gemini.google.com',39,'IA','2025-10-22 15:52:41'),(112,'49418787873','localhost',160,'Produtividade & Ferramentas','2025-10-22 15:55:21'),(113,'49418787873','localhost',15,'Produtividade & Ferramentas','2025-10-22 15:55:38'),(114,'49418787873','gemini.google.com',386,'IA','2025-10-22 16:02:05'),(115,'49418787873','localhost',11,'Produtividade & Ferramentas','2025-10-22 16:02:22'),(116,'49418787873','gemini.google.com',48,'IA','2025-10-22 16:03:10'),(117,'49418787873','localhost',26,'Produtividade & Ferramentas','2025-10-22 16:03:42'),(118,'49418787873','gemini.google.com',19,'IA','2025-10-22 16:04:02'),(119,'49418787873','localhost',14,'Produtividade & Ferramentas','2025-10-22 16:04:16'),(120,'49418787873','gemini.google.com',50,'IA','2025-10-22 16:05:07'),(121,'49418787873','gemini.google.com',238,'IA','2025-10-22 16:09:26'),(122,'49418787873','localhost',6,'Produtividade & Ferramentas','2025-10-22 16:09:32'),(123,'49418787873','localhost',20,'Produtividade & Ferramentas','2025-10-22 16:09:52'),(124,'49418787873','gemini.google.com',12,'IA','2025-10-22 16:10:04'),(125,'49418787873','localhost',6,'Produtividade & Ferramentas','2025-10-22 16:10:11'),(126,'49418787873','gemini.google.com',70,'IA','2025-10-22 16:11:21'),(127,'49418787873','localhost',474,'Produtividade & Ferramentas','2025-10-22 16:19:15'),(128,'49418787873','gemini.google.com',198,'IA','2025-10-22 16:22:38'),(129,'49418787873','localhost',9,'Produtividade & Ferramentas','2025-10-22 16:22:48'),(130,'49418787873','localhost',68,'Produtividade & Ferramentas','2025-10-22 16:23:56'),(131,'49418787873','localhost',8,'Produtividade & Ferramentas','2025-10-22 16:24:08'),(132,'49418787873','gemini.google.com',262,'IA','2025-10-22 16:28:31'),(133,'49418787873','localhost',7,'Produtividade & Ferramentas','2025-10-22 16:28:43'),(134,'49418787873','gemini.google.com',62,'IA','2025-10-22 16:29:45'),(135,'49418787873','localhost',8,'Produtividade & Ferramentas','2025-10-22 16:29:58'),(136,'49418787873','gemini.google.com',69,'IA','2025-10-22 16:31:07'),(137,'49418787873','localhost',20,'Produtividade & Ferramentas','2025-10-22 16:31:29'),(138,'49418787873','localhost',9,'Produtividade & Ferramentas','2025-10-22 16:31:37'),(139,'49418787873','gemini.google.com',101,'IA','2025-10-22 16:33:19'),(140,'49418787873','localhost',9,'Produtividade & Ferramentas','2025-10-22 16:33:34'),(141,'49418787873','gemini.google.com',221,'IA','2025-10-22 16:37:15'),(142,'49418787873','localhost',24,'Produtividade & Ferramentas','2025-10-22 16:37:46'),(143,'49418787873','gemini.google.com',21,'IA','2025-10-22 16:38:06'),(144,'49418787873','localhost',11,'Produtividade & Ferramentas','2025-10-22 16:38:17'),(145,'49418787873','gemini.google.com',360,'IA','2025-10-22 16:44:17'),(146,'49418787873','localhost',15,'Produtividade & Ferramentas','2025-10-22 16:44:37'),(147,'49418787873','localhost',37,'Produtividade & Ferramentas','2025-10-22 16:45:17'),(148,'49418787873','gemini.google.com',202,'IA','2025-10-22 16:48:39'),(149,'49418787873','localhost',26,'Produtividade & Ferramentas','2025-10-22 16:49:10'),(150,'49418787873','gemini.google.com',96,'IA','2025-10-22 16:50:46'),(151,'49418787873','localhost',9,'Produtividade & Ferramentas','2025-10-22 16:51:00'),(152,'49418787873','gemini.google.com',12,'IA','2025-10-22 16:51:17'),(153,'49418787873','localhost',7,'Produtividade & Ferramentas','2025-10-22 16:51:30'),(154,'49418787873','gemini.google.com',102,'IA','2025-10-22 16:53:11'),(155,'49418787873','localhost',27,'Produtividade & Ferramentas','2025-10-22 16:53:43'),(156,'49418787873','gemini.google.com',110,'IA','2025-10-22 16:55:32'),(157,'49418787873','localhost',33,'Produtividade & Ferramentas','2025-10-22 16:56:11'),(158,'49418787873','gemini.google.com',105,'IA','2025-10-22 16:57:56'),(159,'49418787873','localhost',49,'Produtividade & Ferramentas','2025-10-22 16:58:50'),(160,'49418787873','gemini.google.com',260,'IA','2025-10-22 17:03:10'),(161,'49418787873','localhost',33,'Produtividade & Ferramentas','2025-10-22 17:03:48'),(162,'49418787873','gemini.google.com',363,'IA','2025-10-22 17:09:51'),(163,'49418787873','gemini.google.com',24,'IA','2025-10-22 17:10:24'),(164,'49418787873','github.com',6,'Produtividade & Ferramentas','2025-10-22 17:10:36');
/*!40000 ALTER TABLE `logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `old_logs`
--

DROP TABLE IF EXISTS `old_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `old_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `aluno_id` varchar(255) NOT NULL,
  `archive_date` date NOT NULL COMMENT 'A data a que os logs se referem',
  `daily_logs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Objeto JSON com os dados agregados' CHECK (json_valid(`daily_logs`)),
  PRIMARY KEY (`id`),
  KEY `idx_archive_date` (`archive_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `old_logs`
--

LOCK TABLES `old_logs` WRITE;
/*!40000 ALTER TABLE `old_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `old_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `professors`
--

DROP TABLE IF EXISTS `professors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `professors` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) NOT NULL,
  `username` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL COMMENT 'Senha criptografada com bcrypt',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `professors`
--

LOCK TABLES `professors` WRITE;
/*!40000 ALTER TABLE `professors` DISABLE KEYS */;
INSERT INTO `professors` VALUES (1,'Airton sena','prof. batida de coco','email_0uMZyq5todSIbhdR5tsi7QzixbH3@example.com','$2b$10$DUMMYPASSWORDHASH','2025-10-17 19:46:00'),(2,'Leonardo Gomes Garcia','leoleo','email_3H8YJUTTRbWS9rd97vUcIKExze93@example.com','$2b$10$DUMMYPASSWORDHASH','2025-10-17 19:46:00'),(3,'Ana Clara Fernandinha','fefa','email_J38WXbzW34WZGCeR8JhO2q2uXIA3@example.com','$2b$10$DUMMYPASSWORDHASH','2025-10-17 19:46:00'),(4,'Professor Teste','prof.teste','email_xlZ5ffLyb3aX9d9tFN5oVcejZvg1@example.com','$2b$10$DUMMYPASSWORDHASH','2025-10-17 19:46:00'),(5,'Prof Gu','prof.gu','gustavo.sesi.bol@gmail.com','$2b$10$IO9AGQGP8qcEBNE8ae0CnOG226eOoRpmEgPUysi.fRAo2hqhbcNLy','2025-10-22 16:57:51');
/*!40000 ALTER TABLE `professors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `students`
--

DROP TABLE IF EXISTS `students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `students` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) NOT NULL,
  `cpf` varchar(20) DEFAULT NULL,
  `pc_id` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`),
  UNIQUE KEY `pc_id` (`pc_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `students`
--

LOCK TABLES `students` WRITE;
/*!40000 ALTER TABLE `students` DISABLE KEYS */;
INSERT INTO `students` VALUES (1,'Sidney da Silva Paulino','47821634875','PC18','2025-10-17 19:46:00'),(2,'Ana Lara Fernandes','60522655823',NULL,'2025-10-17 19:46:00'),(3,'Gustavo Alves','49418787873','PC22','2025-10-17 19:46:00');
/*!40000 ALTER TABLE `students` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-10-22 17:15:17
