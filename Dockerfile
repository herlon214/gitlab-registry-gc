FROM node:10.14.2

ENV NODE_ENV production
ENV CONFIG_FILE '/var/grgc/config.yaml'

WORKDIR /app

COPY [".", "./"]

RUN npm i

CMD npm start