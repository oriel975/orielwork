import requests
import re
import json

api_key = "AIzaSyCUxqNzd24TNNtjxvttbUdVVauoU1-D3yE"
origin = 'תל אביב'

with open("dests.txt", encoding = 'utf-8') as f:
 file = f.read().splitlines()
 destinations= str(file[0])
 for l in file[1:]:
            destinations += ('|' + str(l))
 disAndTimeURL = f"https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins={origin}&destinations={destinations}&key={api_key}"
 try:
        disAndTimeResponse = requests.get(disAndTimeURL)
        if disAndTimeResponse.status_code == 200:
            disAndTimeResponseData = disAndTimeResponse.json()
        else:
                print("HTTP response is not 200 OK")
 except:
        print("Sending HTTP request failed")

 latLonURL = f"https://maps.googleapis.com/maps/api/geocode/json?address={destinations}&key={api_key}"
 
 try:
        latLonResponse = requests.get(latLonURL)
        if latLonResponse.status_code == 200:
            latLonResponseData = latLonResponse.json()
        else:
                print("HTTP response is not 200 OK")
 except:
        print("Sending HTTP request failed")

i = 0        
locationdict = {}

for destination in disAndTimeResponseData['destination_addresses']:
        longitude = latLonResponseData['results'][0]['geometry']['location']['lng']
        latitude = latLonResponseData['results'][0]['geometry']['location']['lat']
        duration = disAndTimeResponseData['rows'][0]['elements'][i]['duration']['text']
        distance = disAndTimeResponseData['rows'][0]['elements'][i]['distance']['text']
        if re.search('day', duration):
             duration = int(duration.split()[0])*24 + int(duration.split()[2])
        locationdict[destination] = (distance, duration, longitude, latitude)
        i += 1


print('Destinations information:')
for destination in locationdict:
 print("\n")
 print('Destination:',destination,",","Distance:",locationdict[destination][0],",",'Duration:',locationdict[destination][1],",","Lat:",locationdict[destination][3],",","Lon:",locationdict[destination][2])
print("\n")
DistanceListWithSort = sorted(locationdict.items(), key=lambda item: item[1][0], reverse = False)
print('The top 3 destinations far from Tel Aviv')
print (DistanceListWithSort[-1][0])
print (DistanceListWithSort[-2][0])
print (DistanceListWithSort[-3][0])
