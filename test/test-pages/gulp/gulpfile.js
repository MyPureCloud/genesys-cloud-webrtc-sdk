'use strict';

const browserify = require('browserify');
const gulp = require('gulp');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const uglify = require('gulp-uglify');
const babelify = require('babelify');
const gutil = require('gulp-util');

gulp.task('default', function () {
  // set up the browserify instance on a task basis
  const b = browserify({
    entries: './common/main.js',
    debug: true
  }).transform(babelify, { presets: ['@babel/preset-env'], plugins: ['@babel/plugin-transform-runtime'] });

  return b.bundle()
    .pipe(source('./sdk-sample.js'))
    .pipe(buffer())
    // Add transformation tasks to the pipeline here.
    .pipe(uglify())
    .on('error', gutil.log)
    .pipe(gulp.dest('.'));
});
