# 3D Prints Tracking

Database for tracking 3D prints in the Makerspace.

- Uses Node.js and Express.js with a PostgreSQL Database

# Dev Usage

- Clone to a directory
```
git clone https://github.com/scholarslab/makerspace-tracker.git
```

- Install the dependencies
```
npm install
```

- Run the server locally
```
npm run dev
```

View the website in the browser: http://localhost:5000/

# ToDo Next:
- get everything inserting into the database correctly
  - What to do if no value supplied?
- Hosting on Heroku?
  - Write out steps to get on Heroku
  - S3 storage for the files and images
- Hosting on RaspberryPi
  - push everything to the pi
