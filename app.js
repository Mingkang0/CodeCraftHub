/**
 * CodeCraftHub - Personal Learning Goal Tracker API
 * ------------------------------------------------
 * A beginner-friendly Express REST API that stores course data in a
 * plain JSON file (courses.json). No database required.
 *
 * Run:  npm install  &&  npm start
 * Test: http://localhost:5000/api/courses
 */

const express = require('express');
const fs = require('fs');          // built-in module for reading/writing files
const path = require('path');      // built-in module for safe file paths

const app = express();

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;                    // server port
const DATA_FILE = path.join(__dirname, 'courses.json');   // full path to data file

// Only these three values are allowed for "status"
const VALID_STATUSES = ['Not Started', 'In Progress', 'Completed'];

// Middleware: automatically parse incoming JSON bodies into req.body
app.use(express.json());

// ---------------------------------------------------------------------------
// 2. Helper functions (file storage + validation)
// ---------------------------------------------------------------------------

/**
 * Create courses.json (with an empty array) if it does not exist yet.
 * Throws an error if the file cannot be created.
 */
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
    console.log(`[setup] Created new data file: ${DATA_FILE}`);
  }
}

/**
 * Read all courses from the JSON file.
 * Returns an array. Throws if the file cannot be read or is not valid JSON.
 */
function loadCourses() {
  ensureDataFile();                                   // file must exist first
  const raw = fs.readFileSync(DATA_FILE, 'utf8');     // may throw (read error)

  if (raw.trim() === '') return [];                   // empty file -> no courses

  const parsed = JSON.parse(raw);                     // may throw (invalid JSON)
  if (!Array.isArray(parsed)) {
    throw new Error('courses.json must contain a JSON array');
  }
  return parsed;
}

/**
 * Write the full courses array back to the JSON file.
 * Throws if the file cannot be written.
 */
function saveCourses(courses) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(courses, null, 2), 'utf8');
}

/**
 * Generate the next auto-increment id, starting at 1.
 * Uses the highest existing id so ids are never reused after a delete
 * *unless* the file becomes empty again.
 */
function getNextId(courses) {
  if (courses.length === 0) return 1;
  return Math.max(...courses.map((c) => Number(c.id) || 0)) + 1;
}

/**
 * Timestamp in "YYYY-MM-DD HH:MM:SS" format (UTC), e.g. 2025-11-04 10:30:00
 */
function nowTimestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Check that a string is a real calendar date in YYYY-MM-DD format.
 * Rejects things like "2025-02-30" or "31-12-2025".
 */
function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validate a request body for creating (partial = false) or
 * updating (partial = true) a course.
 * Returns an array of human-readable error messages (empty array = valid).
 */
function validateCourse(body, partial) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['Request body must be a JSON object.'];
  }

  const requiredFields = ['name', 'description', 'target_date', 'status'];

  // For POST, all required fields must be present and non-empty
  if (!partial) {
    const missing = requiredFields.filter(
      (field) => body[field] === undefined || body[field] === null || String(body[field]).trim() === ''
    );
    if (missing.length > 0) {
      errors.push(`Missing required field(s): ${missing.join(', ')}`);
    }
  }

  // Validate each field only if it was actually provided
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      errors.push('"name" must be a non-empty string.');
    }
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.trim() === '') {
      errors.push('"description" must be a non-empty string.');
    }
  }

  if (body.target_date !== undefined) {
    if (!isValidDateString(body.target_date)) {
      errors.push('"target_date" must be a valid date in YYYY-MM-DD format (e.g. 2025-12-31).');
    }
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      errors.push(`"status" must be one of: ${VALID_STATUSES.join(', ')}.`);
    }
  }

  return errors;
}

/**
 * Parse and validate the :id route parameter.
 * Returns a number, or null if it is not a positive integer.
 */
function parseId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// 3. Routes
// ---------------------------------------------------------------------------
// NOTE: Express matches routes top-to-bottom, so any literal path such as
// "/api/courses/stats" MUST be declared BEFORE "/api/courses/:id".
// ---------------------------------------------------------------------------

/* ---------------------------------------------------------------------------
 * BONUS (optional): GET /api/courses/stats
 * Returns totals per status. Delete this block if you don't want it.
 * ------------------------------------------------------------------------- */
app.get('/api/courses/stats', (req, res) => {
  try {
    const courses = loadCourses();
    const byStatus = { 'Not Started': 0, 'In Progress': 0, Completed: 0 };

    for (const course of courses) {
      if (byStatus[course.status] !== undefined) byStatus[course.status] += 1;
    }

    res.status(200).json({
      success: true,
      total: courses.length,
      by_status: byStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to read course data: ${error.message}`,
    });
  }
});

/* ---------------------------------------------------------------------------
 * GET /api/courses  ->  list every course
 * ------------------------------------------------------------------------- */
app.get('/api/courses', (req, res) => {
  try {
    const courses = loadCourses();
    res.status(200).json({
      success: true,
      count: courses.length,
      courses,
    });
  } catch (error) {
    // Covers file read errors and corrupted JSON
    res.status(500).json({
      success: false,
      error: `Failed to read course data: ${error.message}`,
    });
  }
});

/* ---------------------------------------------------------------------------
 * GET /api/courses/:id  ->  get one course
 * (The requirement "GET /api/courses/" with no id cannot identify a course,
 *  so the id segment is required.)
 * ------------------------------------------------------------------------- */
app.get('/api/courses/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({
      success: false,
      error: `Invalid course id "${req.params.id}". Id must be a positive integer.`,
    });
  }

  try {
    const course = loadCourses().find((c) => Number(c.id) === id);

    if (!course) {
      return res.status(404).json({
        success: false,
        error: `Course with id ${id} not found.`,
      });
    }

    res.status(200).json({ success: true, course });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to read course data: ${error.message}`,
    });
  }
});

/* ---------------------------------------------------------------------------
 * GET /api/courses/stats  ->  statistics about all courses
 * MUST be declared BEFORE "/api/courses/:id", otherwise ":id" will
 * capture "stats" and try to parse it as a number.
 * ------------------------------------------------------------------------- */
app.get('/api/courses/stats', (req, res) => {
  try {
    const courses = loadCourses();

    // Start all counters at 0 so the response shape is always the same
    const byStatus = {
      'Not Started': 0,
      'In Progress': 0,
      'Completed': 0,
    };

    // Count each course by its status
    for (const course of courses) {
      if (byStatus[course.status] !== undefined) {
        byStatus[course.status] += 1;
      }
    }

    res.status(200).json({
      success: true,
      total: courses.length,
      by_status: byStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to read course data: ${error.message}`,
    });
  }
});

/* ---------------------------------------------------------------------------
 * POST /api/courses  ->  create a new course
 * Body: { name, description, target_date, status }
 * ------------------------------------------------------------------------- */
app.post('/api/courses', (req, res) => {
  // 1) Validate input BEFORE touching the file
  const errors = validateCourse(req.body, false);
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed.',
      details: errors,
    });
  }

  try {
    const courses = loadCourses();

    // 2) Build the new course object
    const newCourse = {
      id: getNextId(courses),
      name: req.body.name.trim(),
      description: req.body.description.trim(),
      target_date: req.body.target_date,
      status: req.body.status,
      created_at: nowTimestamp(),
    };

    courses.push(newCourse);
    saveCourses(courses);   // may throw (write error)

    res.status(201).json({
      success: true,
      message: 'Course created successfully.',
      course: newCourse,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to save course: ${error.message}`,
    });
  }
});

/* ---------------------------------------------------------------------------
 * PUT /api/courses/:id  ->  update an existing course
 * Body: any subset of { name, description, target_date, status }
 * (id and created_at are never changed)
 * ------------------------------------------------------------------------- */
app.put('/api/courses/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({
      success: false,
      error: `Invalid course id "${req.params.id}". Id must be a positive integer.`,
    });
  }

  // Validate only the fields that were sent
  const errors = validateCourse(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed.',
      details: errors,
    });
  }

  // Nothing to update?
  const updatable = ['name', 'description', 'target_date', 'status'];
  const provided = updatable.filter((field) => req.body[field] !== undefined);
  if (provided.length === 0) {
    return res.status(400).json({
      success: false,
      error: `No updatable fields provided. Send at least one of: ${updatable.join(', ')}.`,
    });
  }

  try {
    const courses = loadCourses();
    const index = courses.findIndex((c) => Number(c.id) === id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: `Course with id ${id} not found.`,
      });
    }

    // Copy only the allowed fields onto the existing course
    const course = courses[index];
    for (const field of provided) {
      course[field] =
        typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
    }
    courses[index] = course;
    saveCourses(courses);

    res.status(200).json({
      success: true,
      message: 'Course updated successfully.',
      course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to update course: ${error.message}`,
    });
  }
});

/* ---------------------------------------------------------------------------
 * DELETE /api/courses/:id  ->  remove a course
 * ------------------------------------------------------------------------- */
app.delete('/api/courses/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({
      success: false,
      error: `Invalid course id "${req.params.id}". Id must be a positive integer.`,
    });
  }

  try {
    const courses = loadCourses();
    const index = courses.findIndex((c) => Number(c.id) === id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: `Course with id ${id} not found.`,
      });
    }

    const [deletedCourse] = courses.splice(index, 1);  // remove it
    saveCourses(courses);

    res.status(200).json({
      success: true,
      message: 'Course deleted successfully.',
      deleted_course: deletedCourse,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to delete course: ${error.message}`,
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Fallback handlers
// ---------------------------------------------------------------------------

// Any unmatched route -> 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Central error handler (e.g. malformed JSON in the request body)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body. Check for missing commas or quotes.',
    });
  }
  console.error('[error]', err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// ---------------------------------------------------------------------------
// 5. Start the server
// ---------------------------------------------------------------------------
try {
  ensureDataFile();          // create courses.json on first run
} catch (error) {
  console.error(`[fatal] Could not create ${DATA_FILE}: ${error.message}`);
  process.exit(1);           // nothing will work without the data file
}

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('CodeCraftHub API is starting...');
  console.log('='.repeat(60));
  console.log(`Data file : ${DATA_FILE}`);
  console.log(`API base  : http://localhost:${PORT}/api/courses`);
  console.log('='.repeat(60));
  console.log('Press CTRL+C to stop the server\n');
});

module.exports = app;  // exported for testing (e.g. supertest)