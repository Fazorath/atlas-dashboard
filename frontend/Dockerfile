FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The release job passes the tag; "What's new" shows only when it is set.
ARG ATLAS_VERSION=
ENV ATLAS_VERSION=$ATLAS_VERSION
RUN npm run build


FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
