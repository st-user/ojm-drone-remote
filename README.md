# ojm-drone-remote/ojm-drone-local

The toy application to control [Tello EDU](https://www.ryzerobotics.com/jp/tello-edu) on a browser over the internet using WebRTC.
This application is made by the author personally and is **NOT** an official application by Ryze tech. 

This 'ojm-drone-remote' is used together with ['ojm-drone-local'](https://github.com/st-user/ojm-drone-local). So I'll explain about both 'ojm-drone-remote' and 'ojm-drone-local' in this README.


**Architecture image**

![overview](./README-images/ojm-drone-arch-overview.png)



# System Requirements

 - Both ojm-drone-remote & ojm-drone-local

    - macOS 11
      - Safari 14 or later
      - Google Chrome (latest edition)
      - Microsoft Edge (latest edition)
    - Windows 10
      - Google Chrome (latest edition)
      - Microsoft Edge (latest edition)

 - ojm-drone-remote
    - Node.js 14 or later

 - ojm-drone-local
    - Python 3.7 or later

 - drone
    - [Tello EDU](https://www.ryzerobotics.com/jp/tello-edu) (controlled by using [SDK 2.0](https://dl-cdn.ryzerobotics.com/downloads/Tello/Tello%20SDK%202.0%20User%20Guide.pdf))


# How to install

After installing the applications using the commands below, you may need to edit the environment variables in `.env` files according to your environment.

For more infromation, please see the documentations on each variable in `.env` files.

If you want to just work through the 'How to use' below, you don't have to change them.

## ojm-drone-remote

### macOS
```
git clone https://github.com/st-user/ojm-drone-remote.git
cd ojm-drone-remote
npm install
cp template.env .env
```

### Windows 10
```
git clone https://github.com/st-user/ojm-drone-remote.git
cd ojm-drone-remote
npm install
copy template.env .env
```

## ojm-drone-local

### macOS

```
git clone https://github.com/st-user/ojm-drone-local.git
cd ojm-drone-local
python -m venv venv
source ./venv/bin/activate
pip install -r requirements.txt
cp template.env .env
```

### Windows 10

```
git clone https://github.com/st-user/ojm-drone-local.git
cd ojm-drone-local
python -m venv venv
.\venv\Scripts\activate.bat
pip install -r requirements.txt
copy template.env .env
```

(When you use PowerShell, the command that activates venv is slightly different.)


# How to use

For simplicity, the guides below show the way that you run the applications on a single PC.
If you want to deploy the applications separately, for example you want to run 'ojm-drone-remote' on a server installed in another PC (not localhost), you need to change some environment variables in `.env` files
(at least, `SIGNALING_ENDPOINT` in `.env` of 'ojm-drone-local').

For more infromation, please see the documentations on each variable in `.env` files.

## Start the applications

### ojm-drone-remote

Open your terminal, move to the project's root directory and run:

```
node app.js
```

When the application starts without errors, open your browser and access:

```
http://localhost:8080
```

You should see a web page like:

![ojm-drone-remote-index-page-image](./README-images/ojm-drone-remote_1.png)


### ojm-drone-local

**NOTE**: If you set the environment variable `USE_DRONE` to `True` in `.env` of 'ojm-drone-local', make sure that your PC on which 'ojm-drone-local' app runs successfully connects to Tello EDU by Wi-Fi.

Open the terminal different from the one that you run `node app.js` above, move to the project's root directory and run:

#### macOS

```
source ./venv/bin/activate
python run.py
```

#### Windows 10

```
.\venv\Scripts\activate.bat
python run.py
```

When the application starts without errors, open your browser and access:

```
http://localhost:8000
```

You should see a web page like:

![ojm-drone-local-index-page-image](./README-images/ojm-drone-local_1.png)

## Use the applications


1. At the 'ojm-drone-local' web page, click 'Generate' button.
2. At the 'ojm-drone-local' web page, click 'START' button.
3. At the 'ojm-drone-local' web page, copy the generated code ('Start Code').
4. At the 'ojm-drone-remote' web page, paste the 'Start Code' into the text box.
5. At the 'ojm-drone-remote' web page, click 'START' button.

   When the WebRTC connection between 'ojm-drone-remote' and 'ojm-drone-local' is successfully established, at the 'ojm-drone-remote' web page you can see the result like:

   ![ojm-drone-remote-result](./README-images/ojm-drone-remote_2.png)

   **NOTE**:

   When the environment variable `USE_DRONE` is `False`, you should see the test movie like the image above.
   
   On the other hand, when the enviroment variable `USE_DRONE` is `True`, you should see the video that Tello EDU caputures by its webcam.



6. At the 'ojm-drone-local' web page, click 'Takeoff' button.

   When 'Takeoff' button is clicked, the bottom buttons at the 'ojm-drone-remote' web page become clickable.


   **NOTE**:

   When the environment variable `USE_DRONE` is `False`, the bottom buttons become clickable but nothing happends in addition.
   On the other hand, when the enviroment variable `USE_DRONE` is `True`, the bottom buttons become clickable and Tello EDU takes off!


**NOTE**:

If you don't get any error but can't see the video, please check your PC's firewall settings. It could be preventing the WebRTC connection.


# Using Docker

In order to run 'ojm-drone-remote' on docker container easily, the repository contains Dockerfile.

Especially you can deploy it to Google Cloud's [Cloud Run](https://cloud.google.com/run/) out of the box.

Example:

```
gcloud auth login
gcloud builds submit --tag gcr.io/<YOUR-PROJECT-ID>/<YOUR=APP=NAME>
gcloud run deploy --image gcr.io/<YOUR-PROJECT-ID>/<YOUR=APP=NAME> --platform managed
```

For more information, please see [Build and deploy a Node.js service](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/nodejs)

# Using coturn (TURN Server)

When you want the applications to communicate with each other by WebRTC over the internet, usually you have to use TURN server.
I recommend using open source TURN Server [coturn](https://github.com/coturn/coturn) for this purpose.

In order to use [coturn](https://github.com/coturn/coturn), you need to set the environment variables in `.env` file of 'ojm-drone-remote' properly.

```
NODE_ENV=production
TURN_SECRET=....
HOURS_TURN_CREDENTIAL_VALID=...
STUN_URL=...
TURN_URL=...
```

For more information, please see the documentations in `.env` file of 'ojm-drone-remote'.