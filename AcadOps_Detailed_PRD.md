# PRODUCT REQUIREMENT DOCUMENT (PRD)
## PROJECT NAME: AcadOps - AI-Powered Academic Timetable & Faculty Operations System (v5.0)

---

## 1. Executive Summary & Vision
AcadOps is a comprehensive enterprise web application designed to automate, optimize, and streamline academic timetabling, faculty leave substitution, peer-to-peer hour swapping, exam seating arrangements, and department data ingestion. 

By replacing manual, spreadsheet-based timetabling processes with a constraint-satisfying AI engine, AcadOps guarantees conflict-free calendars, reduces administrative workload for Heads of Department (HODs) by up to 90%, and provides faculty members with real-time flexibility to coordinate swaps and leaves while maintaining absolute database integrity.

---

## 2. Target Roles & Security Scoping (RBAC)
The platform enforces a strict Role-Based Access Control (RBAC) structure. Access scopes are isolated at the database API level (Row-Level Security) to prevent cross-department tampering.

### 2.1 Super Admin (Dean/Principal)
* **Access Scope:** Global across all college departments.
* **Core Actions:**
  * Define and configure departments (e.g., CSE, CSD, EEE, IT, ECE, Chemical, Biotech, Civil).
  * Register HOD accounts and assign them to specific department IDs.
  * Manage institution-wide defaults (session timings, default period duration, global calendar).
  * Access institute-wide analytics, leave metrics, and master grids.

### 2.2 Head of Department (HOD)
* **Access Scope:** Isolated strictly to their assigned department ID.
* **Core Actions:**
  * Upload department-wide data files (Faculty, Subjects, Sections, Classrooms).
  * Perform inline staging audits and data remediation on validation failures.
  * Trigger the AI Timetable Optimization Engine.
  * Manually edit the published timetable (swap hours, assign rooms, override slots).
  * Review and approve/reject leave requests with substitute recommendations.

### 2.3 Faculty / Mentor
* **Access Scope:** Personal timetable view and section-specific views.
* **Core Actions:**
  * View personal workload and dynamic timetable schedules.
  * Submit leave requests (dates, periods).
  * Initiate peer-to-peer period swap requests.
  * Accept/decline incoming swap requests from other teachers.
  * View Assigned Student Mentor lists.

---

## 3. Data Ingestion & Multi-Stage Validation Engine
HODs upload department configurations via Excel (`.xlsx`, `.xls`) or CSV files. The validation engine ensures that data matches the database structure before moving it to production.

```
       [ Upload CSV/Excel ] 
                │
                ▼
     [ Stage 1: Header Check ] ──────────┐
                │                        │
                ▼                        ▼
     [ Stage 2: Missing Fields ] ───► [ FAILED ] ──► [ UI Inline Remediation ]
                │                        ▲                    │
                ▼                        │                    │ (Fix Inline)
     [ Stage 3: Duplicate Keys ] ────────┘                    │
                │                                             ▼
                ▼                                      [ Re-Validate ]
     [ Stage 4: Business Rules ]
                │
                ▼
     [ Commit to Supabase DB ]
```

### 3.1 Validation Stages
1. **Stage 1: Header Column Match**
   * Asserts the presence of all required columns: `Department`, `DepartmentName`, `AcademicYear`, `SectionName`, `SubjectCode`, `SubjectName`, `SubjectType`, `FacultyEmail`, `FacultyName`, `Designation`, `IsHOD`, `IsDean`, `IsClassTeacher`, `MentorEmails`, `RoomNumber`, `Capacity`, `RoomType`.
2. **Stage 2: Row Integrity & Null Constraints**
   * Flags missing email addresses, blank subject codes, or invalid numbers (e.g., negative room capacity).
3. **Stage 3: Duplicate Keys & Conflict Prevention**
   * Asserts that `SubjectCode` is unique per department, `FacultyEmail` matches a unique profile, and `SectionName` maps to only one configuration per academic year.
4. **Stage 4: Business Validation Rules**
   * Enforces that HODs are designated with `IsHOD: TRUE`, Class Teachers are valid faculty, and subject hours match curriculum credits.

### 3.2 UI Ingestion Staging & Inline Remediation
* **Staging Area:** Uploaded files are not written to the primary tables immediately. Instead, they are parsed and stored in `ImportStagingRecord` tables with status flags (`VALID`, `MISSING_DATA`, `INVALID`).
* **Interactive Grid:** HODs view warnings directly in the UI. Missing emails, names, or incorrect rooms are highlighted in yellow/red. HODs can click **Fix / Edit** to type correct values directly into the browser and re-run validations without re-uploading the file.
* **Commit Path:** The "Confirm & Commit" button is unlocked only when all staging records pass validation (0 errors).

---

## 4. AI Timetable Solver Core & College Business Rules
The AI engine runs a Genetic Algorithm / Constraint Satisfaction Solver in the FastAPI backend to compile optimized weekly timetables.

### 4.1 Strict Constraints (Hard Rules)
1. **HOD Exclusions:** The HOD of any department must not be assigned classes during the first period (e.g., 8:50 AM - 9:40 AM) or the last period (e.g., 2:40 PM - 3:30 PM) to allow room for administrative duties.
2. **HOD Wednesday Afternoon Rule:** On Wednesdays, the HOD cannot have any classes assigned after the lunch break (afternoon sessions).
3. **Variable Lunch Breaks:**
   * **First-Year Students:** Lunch is after the first 3 periods. They have 4 periods after lunch.
   * **Upper Years (2nd, 3rd, 4th Years):** Lunch is after the first 4 periods. They have 3 periods after lunch.
4. **Faculty Load limits:** Faculty can be assigned a maximum of 2 periods consecutively; they must not be scheduled for 3 or more consecutive hours.
5. **Lab Hour Blocks:** Some sections have labs of 2 periods, others have labs of 3 periods. The configuration is read from `SubjectType` and must be grouped continuously (e.g., periods 5-7).
6. **HOD Lab Hours Limitation:**
   * If a professor teaches 2 subjects related to labs: limit to exactly 2 labs per week.
   * If a professor teaches only 1 lab subject: limit to a maximum of 3 labs per week.
7. **Free Periods Rules:** Free slots like Sports and Library must only be placed at the last period of the day. If not possible, they can be placed in the 4th period (immediately before the upper-year lunch break).
8. **Counselling Period:** Must be scheduled only in the last period of the day, exactly once a week per section.

---

## 5. Leave Management & AI Substitute Allocation
When a faculty member requests leave, the system executes an automated workflow to cover affected periods.

```
 [ Submit Leave Request ] ➔ [ Date, Periods Isolated ] ➔ [ HOD / Admin Review ]
                                                                 │
  ┌─────────────────────────── APPROVED ─────────────────────────┘
  │
  ▼
 [ AI Substitute Allocation ] ──► Matches: same department, free slot, workload limit
  │
  ▼
 [ Auto-Update Timetable ] ──► Notify both faculty members via email
```

### 5.1 Ingestion & Date Isolation
* Faculty inputs the date range and specific periods. The system flags the exact timetable slots that are now vacant.
### 5.2 HOD Approval Step
* The HOD reviews the request in their portal. The system highlights the conflicts caused by the leave.
### 5.3 AI Substitute Recommendation
* For each vacant slot, the backend automatically queries the database for available faculty:
  * Must belong to the same department.
  * Must be free (no class assigned) during that specific slot.
  * Must not exceed their maximum daily/weekly workload limits.
  * Prioritizes teachers with lower workload counts to maintain balance.
* Once approved, the timetable is updated in real-time, and notifications are sent.

---

## 6. Peer-to-Peer Hour Swap Flow
To provide flexibility without HOD overhead, faculty members can swap class hours directly.

```
 [ Faculty A requests swap with Faculty B ] ➔ [ Specific slots isolated ]
                                                       │
                                                       ▼
                                         [ AI Swap Evaluation Engine ]
                                                       │
             ┌───────────────────────── VALID ─────────┴───────── INVALID ──┐
             │                                                              │
             ▼                                                              ▼
    [ Faculty B Decides ]                                            [ Auto-Rejected ]
             │                                                       [ Notify both ]
      ┌──────┴──────┐
      ▼             ▼
  [ ACCEPT ]    [ DECLINE ]
      │             │
      ▼             ▼
 [ Swap Done ]  [ Canceled ]
```

1. **Request:** Faculty A selects a slot on their timetable and requests a swap with Faculty B for a specific period.
2. **AI Conflict Pre-Check:** The backend immediately analyzes the swap:
   * Checks if Faculty A is free during Faculty B's slot, and vice-versa.
   * Ensures room capacities and types match.
   * Validates that the swap does not violate the maximum 2-consecutive-periods rule.
   * *If invalid:* The request is blocked instantly with a clear error reason.
3. **Acceptance:** If valid, Faculty B receives a notification. Once Faculty B clicks **Accept**, the database commits the slot exchange automatically. HODs receive a log but do not need to approve it manually.

---

## 7. Database Architecture (Supabase Postgres)
AcadOps utilizes Supabase Postgres for all relational storage. To prevent issues arising from high concurrency during multiple staging calculations, transaction pooling rules are configured.

### 7.1 Suppression of Caching Clashes
* **Issue:** When using SQLAlchemy's async engine with transaction-pooled connections (Supabase port 6543), duplicate prepared statement errors (`DuplicatePreparedStatementError`) occur.
* **Solution:** The database engine connection string disables client-side statement caching.
  ```python
  engine = create_async_engine(
      DATABASE_URL,
      connect_args={"statement_cache_size": 0}
  )
  ```

### 7.2 Core Database Schema
* **`User` / `Profile`:** Auth accounts, roles, and profiles.
* **`Department`:** Configuration details of each branch.
* **`FacultyProfile`:** Workload constraints, designations, HOD status, and department ID.
* **`Subject`:** Codes, names, credit hours, types (THEORY/LAB), and sections.
* **`SectionConfig`:** Sections mapped to academic years and classrooms.
* **`Classroom`:** Room numbers, capacities, and types (CLASSROOM/LAB).
* **`TimetableSlot`:** Weekly schedules mapping Section, Subject, Teacher, Room, Day, and Period.
* **`ImportHistory` & `ImportStagingRecord`:** Staging data logs.

---

## 8. Frontend Interface & Seating Arrangements
Built using Vite, React, TailwindCSS, and Lucide Icons.

### 8.1 Key Views
* **Staging Remediation View:** Interactive validation cards highlighting errors, warning totals, and inline forms.
* **Interactive Timetable Grid:** Color-coded matrix showing days (Monday - Saturday) and period slots. HODs can click any slot to swap or edit details directly.
* **Seating Arrangement Generator:**
  * Auto-generates examination seating plans based on enrolled student lists and classroom capacities.
  * Enforces spacing parameters (e.g., alternate seats left empty, alternating branches in the same room to prevent copying).

---

## 9. Reports & Analytics Portal
1. **Workload Reports:** Displays weekly hours per faculty member, highlighting under-utilization or overload warnings.
2. **Leave Reports:** Audit history of all taken leaves, approved substitutes, and total classes covered.
3. **Timetable Reports:** Exportable class-wise, room-wise, and teacher-specific grids.
4. **Conflict Reports:** Real-time log of timetable clashes resolved by HOD overrides.
5. **Substitute Reports:** Tracks which teachers have covered the most substitute hours to ensure fair work distribution.

---

## 10. Implementation & Phased Rollout Plan
* **Phase 1: Minimum Viable Product (MVP)**
  * Core database schemas, CSV/Excel parsing, manual timetable grid, and role-based views.
* **Phase 2: Alpha Testing & Ingestion Validation**
  * Staging remediation, constraint checks, and database statement cache suppression.
* **Phase 3: Beta Testing (AI Scheduler Integration)**
  * AI timetable solver, leave coverage recommendation engine, and automated peer swaps.
* **Phase 4: Production Release**
  * Exam seating arrangement generator, analytics reports, and institution-wide rollout.
